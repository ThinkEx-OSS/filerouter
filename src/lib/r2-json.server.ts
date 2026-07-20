import { jsonReadableStream } from "@/lib/json-stream.server"

const MULTIPART_PART_BYTES = 5 * 1024 * 1024

export async function putJson(
  bucket: R2Bucket,
  key: string,
  value: unknown
): Promise<void> {
  return putStream(bucket, key, jsonReadableStream(value))
}

export async function putStream(
  bucket: R2Bucket,
  key: string,
  stream: ReadableStream<Uint8Array>
): Promise<void> {
  const reader = stream.getReader()
  let buffer = new Uint8Array(MULTIPART_PART_BYTES)
  let bufferedBytes = 0
  let upload: R2MultipartUpload | undefined
  const uploadedParts: Array<R2UploadedPart> = []

  try {
    while (true) {
      const chunk = await reader.read()
      if (chunk.done) break
      let sourceOffset = 0
      while (sourceOffset < chunk.value.byteLength) {
        const copiedBytes = Math.min(
          MULTIPART_PART_BYTES - bufferedBytes,
          chunk.value.byteLength - sourceOffset
        )
        buffer.set(
          chunk.value.subarray(sourceOffset, sourceOffset + copiedBytes),
          bufferedBytes
        )
        bufferedBytes += copiedBytes
        sourceOffset += copiedBytes

        if (bufferedBytes < MULTIPART_PART_BYTES) continue
        upload ??= await bucket.createMultipartUpload(key, {
          httpMetadata: { contentType: "application/json" },
        })
        uploadedParts.push(
          await upload.uploadPart(uploadedParts.length + 1, buffer)
        )
        buffer = new Uint8Array(MULTIPART_PART_BYTES)
        bufferedBytes = 0
      }
    }

    if (!upload) {
      await bucket.put(key, buffer.subarray(0, bufferedBytes), {
        httpMetadata: { contentType: "application/json" },
      })
      return
    }

    if (bufferedBytes > 0) {
      uploadedParts.push(
        await upload.uploadPart(
          uploadedParts.length + 1,
          buffer.subarray(0, bufferedBytes)
        )
      )
    }
    await upload.complete(uploadedParts)
  } catch (error) {
    await Promise.all([
      upload?.abort().catch(() => undefined),
      reader.cancel(error).catch(() => undefined),
    ])
    throw error
  } finally {
    reader.releaseLock()
  }
}
