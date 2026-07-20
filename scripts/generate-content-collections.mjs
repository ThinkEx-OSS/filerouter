import { createBuilder } from "@content-collections/core"
import { resolve } from "node:path"

const builder = await createBuilder(resolve("content-collections.ts"))
await builder.build()
