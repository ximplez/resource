export function httpError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

export function requiredString(value, field) {
  if (typeof value !== "string" || value.trim() === "") {
    throw httpError(400, `${field} is required`);
  }
}
