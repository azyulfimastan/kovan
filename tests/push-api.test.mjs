// api/push.js rejects anything that is not a POST with a job id, before touching the network.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import handler from '../api/push.js'

const call = async (method, body) => {
  let code = 200
  let out
  const res = { setHeader() {}, status(c) { code = c; return this }, json(o) { out = o; return this } }
  await handler({ method, body }, res)
  return { code, out }
}

test('other methods are refused', async () => assert.equal((await call('PUT')).code, 405))
test('missing or bad id is refused', async () => {
  assert.equal((await call('POST', {})).code, 400)
  assert.equal((await call('POST', { id: "1' or 1=1" })).code, 400)
})
test('missing env is reported, not crashed', async () => {
  delete process.env.VITE_SUPABASE_URL
  assert.equal((await call('GET')).code, 500)
  assert.equal((await call('POST', { id: '00000000-0000-4000-8000-000000000001' })).code, 500)
})
