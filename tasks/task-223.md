### Task 223: Downscale images to 1024 px before scanning
- [x] Long edge capped at 1024 px in the browser before upload; PNG stays PNG, camera formats become JPEG; decode failures fall back to the untouched file
- [x] Measured on real scans: a 2100 px screenshot drops from 2,768 to 1,574 prompt tokens with the same answer
- [x] Accuracy on the 23 real images at 1024 px: 43 of 46 over two runs, level with the native baseline
- Location: `src/utils/imageDownscale.ts`, `src/app/page.tsx`
