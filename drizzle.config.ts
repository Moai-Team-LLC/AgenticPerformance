import { defineConfig } from "drizzle-kit"

export default defineConfig({
  dialect: "postgresql",
  schema: ["./packages/core/src/database/schema/**/*.ts"],
  out: "./drizzle",
  dbCredentials: {
    // eslint-disable-next-line no-process-env
    url: process.env.DATABASE_URL ?? "postgresql://localhost:5432/apl",
  },
})
