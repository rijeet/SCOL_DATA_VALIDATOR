# Reference archive (local only)

Legacy snapshots, sample CSVs, the **UK UNI** Cloudinary upload tree, bulk-import folders, and extra docs live under **`reference/`**.

That directory is **gitignored** — it is not pushed to the remote. After clone, your machine may have an empty or missing `reference/` folder until you restore archives locally.

| Location | Purpose |
|----------|---------|
| `reference/uk-uni/` | Source for `npm run upload:uk-uni` |
| `reference/New-folder/` | Old full-repo copy for comparison |
| `reference/bulk-import/` | Former `BulkImport/` staging |
| `reference/docs/` | `DEV.GUIDE.md`, `PROJECT-TREE.md`, etc. |
| `reference/sample-data/` | Zips and one-off reviewed CSVs |

See `reference/README.md` on disk for layout details.
