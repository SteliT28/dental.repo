import { json } from "./_middleware.js";

export function onRequestGet({ data }) {
  return json({ email: data.user });
}
