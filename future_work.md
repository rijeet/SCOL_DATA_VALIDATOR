# Future work

## Move university and course CSV uploads to Backblaze

University and course upload CSVs are stored in Cloudinary today (`CloudinaryUniversityDataService` signed raw uploads). Move those files to a **private** Backblaze B2 bucket named `scol-data`.

- Keep the existing public asset bucket (`B2_PUBLIC_*`, `scol-assets`) for images. `scol-data` is private and is only for CSV uploads.
- Use the private B2 settings (`B2_KEY_ID`, `B2_APPLICATION_KEY`, `B2_BUCKET_NAME=scol-data`, `B2_ENDPOINT`, `B2_REGION`).
- Cover both university import CSVs and course import CSVs, including the signed upload URL, the stored object key, and the fetch that runs on import.
- Stop writing new upload CSVs to Cloudinary once the B2 path is live. Leave helper markdown on Cloudinary until that is moved on purpose.

## CORS for the deployed apps

Allow the admin origin on the API:

- Frontend: https://scol-data-frontend.vercel.app/
- Backend: https://scol-data-backend.vercel.app/

Set `CORS_ORIGINS` on the backend project to `https://scol-data-frontend.vercel.app`.

## Show validated data upload on the deployed admin

The validated-data upload flow should be usable on https://scol-data-frontend.vercel.app/, talking to https://scol-data-backend.vercel.app/. That includes uploading a university or course CSV, seeing validation results, and opening a batch that is ready to publish.
