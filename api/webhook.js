import { waitUntil } from '@vercel/functions';
import { createApp } from '../lib/app.js';

let app;
const getApp = () => (app ||= createApp());

export function GET(request) {
  return getApp().verify(new URL(request.url));
}

export async function POST(request) {
  const rawBody = await request.text();
  const { response, work } = await getApp().receive(rawBody, request.headers.get('x-hub-signature-256'));
  waitUntil(work);
  return response;
}
