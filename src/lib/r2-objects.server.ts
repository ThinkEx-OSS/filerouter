export async function deleteR2Objects(
  bucket: R2Bucket,
  keys: Array<string | null>
): Promise<void> {
  const uniqueKeys = [...new Set(keys.filter((key): key is string => !!key))]
  for (let index = 0; index < uniqueKeys.length; index += 1000) {
    await bucket.delete(uniqueKeys.slice(index, index + 1000))
  }
}
