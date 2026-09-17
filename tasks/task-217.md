### Task 217: Keep the real-image eval set in a private R2 bucket
- [x] Bucket `event-every-eval-private`, no public access, no Worker binding
- [x] Pull script restores `scripts/eval-images/real/` for anyone logged in with wrangler; `--push` uploads local changes
- [x] Verified: pulled copy matches the original byte for byte
- Location: `scripts/pull-real-eval-images.sh`
