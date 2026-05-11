export function getFaceServiceUrl(): string {
  return process.env["FACE_SERVICE_URL"] ?? "http://localhost:8001";
}
