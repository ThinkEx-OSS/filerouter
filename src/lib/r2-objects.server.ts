export async function deleteR2Objects(
  bucket: R2Bucket,
  keys: Array<string | null>
): Promise<void> {
  const uniqueKeys = [...new Set(keys.filter((key): key is string => !!key))]
  if (uniqueKeys.length > 0) {
    await bucket.delete(uniqueKeys)
  }
}
