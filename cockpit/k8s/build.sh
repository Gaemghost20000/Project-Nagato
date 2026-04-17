#!/bin/bash
set -euo pipefail

IMAGE_NAME="agent-cockpit"
IMAGE_TAG="latest"
TAR_FILE="/tmp/${IMAGE_NAME}.tar"

echo "==> Building ${IMAGE_NAME}:${IMAGE_TAG}"
docker build -t "${IMAGE_NAME}:${IMAGE_TAG}" ..

echo "==> Saving image to ${TAR_FILE}"
docker save "${IMAGE_NAME}:${IMAGE_TAG}" -o "${TAR_FILE}"

echo "==> Importing image via ctr"
ctr -n k8s.io images import "${TAR_FILE}"

echo "==> Cleaning up tar"
rm -f "${TAR_FILE}"

echo "==> Done. Image ${IMAGE_NAME}:${IMAGE_TAG} is available in k3s."
