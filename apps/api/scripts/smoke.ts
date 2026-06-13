// End-to-end backend smoke test. Run: npx tsx scripts/smoke.ts
// Exercises the full agent/customer flow against a running API.
const API = process.env.SMOKE_API ?? 'http://localhost:4000/api'

let failures = 0
function check(cond: boolean, msg: string) {
  console.log(`${cond ? 'ok  ' : 'FAIL'}  ${msg}`)
  if (!cond) failures++
}
const json = (r: Response) => r.json() as Promise<any>
const text = (r: Response) => r.text()

async function main() {
  // wait for API
  for (let i = 0; i < 15; i++) {
    try {
      const h = await fetch(API.replace('/api', '/health'))
      if (h.ok) break
    } catch {}
    await new Promise((r) => setTimeout(r, 1000))
  }

  const headers = (tok?: string) => ({
    'content-type': 'application/json',
    ...(tok ? { authorization: `Bearer ${tok}` } : {}),
  })

  // 1. login
  const login = await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({ email: 'agent@demo.com', password: 'demo1234' }),
  })
  const loginData = await json(login)
  check(login.status === 200 && !!loginData.token, 'agent login')
  const agentJwt = loginData.token

  // 2. create session
  const create = await fetch(`${API}/sessions`, {
    method: 'POST',
    headers: headers(agentJwt),
    body: JSON.stringify({ title: 'Smoke Test Session' }),
  })
  const createData = await json(create)
  check(create.status === 200 && !!createData.session?.id, 'agent creates session')
  const sessionId = createData.session.id

  // 3. agent join token
  const atok = await fetch(`${API}/sessions/${sessionId}/token`, { method: 'POST', headers: headers(agentJwt) })
  const atokData = await json(atok)
  check(atok.status === 200 && !!atokData.token && !!atokData.participantToken && atokData.role === 'agent', 'agent join token (livekit + participant)')
  const agentPart = atokData.participantToken

  // 4. create invite
  const inv = await fetch(`${API}/sessions/${sessionId}/invites`, { method: 'POST', headers: headers(agentJwt) })
  const invData = await json(inv)
  check(inv.status === 200 && !!invData.token && !!invData.url, 'agent creates invite link')
  const inviteToken = invData.token

  // 5. invite preview
  const preview = await json(await fetch(`${API}/join/${inviteToken}`))
  check(preview.valid === true, 'invite preview is valid')

  // 6. customer joins
  const join = await fetch(`${API}/join/${inviteToken}`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({ name: 'Test Customer' }),
  })
  const joinData = await json(join)
  check(join.status === 200 && !!joinData.token && !!joinData.participantToken && joinData.role === 'customer', 'customer joins via invite (locked-down token)')
  const custPart = joinData.participantToken

  // 6b. bonus: admin live dashboard can see the active session
  const live = await json(await fetch(`${API}/admin/sessions/live`, { headers: headers(agentJwt) }))
  check(Array.isArray(live.sessions) && live.sessions.some((s: any) => s.id === sessionId), 'admin live sessions list includes active session')

  const recList = await json(await fetch(`${API}/sessions/${sessionId}/recordings`, { headers: headers(agentJwt) }))
  check(Array.isArray(recList.recordings), 'recording history list is available')

  // 7. RBAC: customer must NOT be able to perform agent actions
  const hack = await fetch(`${API}/sessions`, {
    method: 'POST',
    headers: headers(custPart),
    body: JSON.stringify({ title: 'hack' }),
  })
  check(hack.status === 401 || hack.status === 403, 'RBAC: customer token cannot create a session')

  const hackEnd = await fetch(`${API}/sessions/${sessionId}/end`, { method: 'POST', headers: headers(custPart) })
  check(hackEnd.status === 401 || hackEnd.status === 403, 'RBAC: customer token cannot end the session')

  // 8. chat persistence (both sides)
  const m1 = await fetch(`${API}/sessions/${sessionId}/messages`, {
    method: 'POST',
    headers: headers(custPart),
    body: JSON.stringify({ body: 'Hello from customer' }),
  })
  check((await json(m1)).message != null, 'customer message persisted')
  const m2 = await fetch(`${API}/sessions/${sessionId}/messages`, {
    method: 'POST',
    headers: headers(agentPart),
    body: JSON.stringify({ body: 'Hi, how can I help?' }),
  })
  check((await json(m2)).message != null, 'agent message persisted')

  // 8b. bonus: file sharing persists a downloadable file in chat history
  const fileBody = {
    fileName: 'smoke-note.txt',
    mimeType: 'text/plain',
    dataBase64: Buffer.from('hello file').toString('base64'),
  }
  const up = await fetch(`${API}/sessions/${sessionId}/files`, {
    method: 'POST',
    headers: headers(custPart),
    body: JSON.stringify(fileBody),
  })
  const upData = await json(up)
  check(up.status === 200 && upData.message?.fileName === 'smoke-note.txt', 'file message persisted')

  const dl = await fetch(`${API}/sessions/${sessionId}/files/${upData.message.id}`, { headers: headers(agentJwt) })
  check(dl.status === 200 && (await text(dl)) === 'hello file', 'file download works for agent')

  // 9. chat history retrievable
  const hist = await json(await fetch(`${API}/sessions/${sessionId}/messages`, { headers: headers(agentJwt) }))
  check(Array.isArray(hist.messages) && hist.messages.length === 3, 'chat history retrievable (messages + file)')

  // 10. session detail includes history
  const detail = await json(await fetch(`${API}/sessions/${sessionId}`, { headers: headers(agentJwt) }))
  check(detail.session?.messages?.length === 3, 'session detail includes chat history')

  // 10b. bonus: Prometheus metrics endpoint is exposed
  const metrics = await text(await fetch(API.replace('/api', '/metrics')))
  check(metrics.includes('vsp_sessions_by_status') && metrics.includes('vsp_chat_messages_total') && metrics.includes('vsp_recordings_by_status'), 'prometheus metrics exposed')

  // 11. end session
  const end = await fetch(`${API}/admin/sessions/${sessionId}/end`, { method: 'POST', headers: headers(agentJwt) })
  const endData = await json(end)
  check(end.status === 200 && endData.session?.status === 'ENDED', 'admin/agent ends session')

  // 12. invite no longer usable
  const joinAfter = await fetch(`${API}/join/${inviteToken}`)
  check(joinAfter.status === 410, 'invite rejected after session ended')

  console.log(`\n${failures === 0 ? 'ALL SMOKE CHECKS PASSED' : failures + ' CHECK(S) FAILED'}`)
  process.exit(failures === 0 ? 0 : 1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
