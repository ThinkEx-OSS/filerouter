import { jsonReadableStream } from "@/lib/json-stream.server"

const MULTIPART_PART_BYTES = 5 * 1024 * 1024

export class StreamSizeLimitError extends Error {
  constructor(limit: number) {
    super(`Stream exceeds the ${limit} byte limit.`)
    this.name = "StreamSizeLimitError"
  }
}

export async function putJson(
  bucket: R2Bucket,
  key: string,
  value: unknown
): Promise<void> {
  await putStream(bucket, key, jsonReadableStream(value), {
    httpMetadata: { contentType: "application/json" },
  })
}

interface PutStreamOptions {
  customMetadata?: Record<string, string>
  httpMetadata?: R2HTTPMetadata
  maxBytes?: number
}

export async function putStream(
  bucket: R2Bucket,
  key: string,
  stream: ReadableStream<Uint8Array>,
  options: PutStreamOptions = {}
): Promise<R2Object> {
  const reader = stream.getReader()
  let buffer = new Uint8Array(MULTIPART_PART_BYTES)
  let bufferedBytes = 0
  let upload: R2MultipartUpload | undefined
  let totalBytes = 0
  const uploadedParts: Array<R2UploadedPart> = []
  const putOptions = {
    ...(options.customMetadata && { customMetadata: options.customMetadata }),
    ...(options.httpMetadata && { httpMetadata: options.httpMetadata }),
  }

  try {
    while (true) {
      const chunk = await reader.read()
      if (chunk.done) break
      totalBytes += chunk.value.byteLength
      if (options.maxBytes !== undefined && totalBytes > options.maxBytes) {
        throw new StreamSizeLimitError(options.maxBytes)
      }
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
        upload ??= await bucket.createMultipartUpload(key, putOptions)
        uploadedParts.push(
          await upload.uploadPart(uploadedParts.length + 1, buffer)
        )
        buffer = new Uint8Array(MULTIPART_PART_BYTES)
        bufferedBytes = 0
      }
    }

    if (!upload) {
      return bucket.put(key, buffer.subarray(0, bufferedBytes), putOptions)
    }

    if (bufferedBytes > 0) {
      uploadedParts.push(
        await upload.uploadPart(
          uploadedParts.length + 1,
          buffer.subarray(0, bufferedBytes)
        )
      )
    }
    return await upload.complete(uploadedParts)
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
