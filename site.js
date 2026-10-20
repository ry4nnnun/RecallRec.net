// Shared bits: where the Recall server lives, and the signed-in session.
//
// The pages talk to the server directly from the browser. That needs the server to be
// reachable over HTTPS with a certificate the browser trusts — a self-signed dev
// certificate is refused before any request is sent, and the page falls back to the
// signed-out view. Point API_BASE at the server once it is published properly.

const API_BASE = 'https://ns.213-10-98-40.sslip.io:8787'

// Discovery names each service; auth and the API live on their own subdomains.
const serviceHost = (name) => {
	const url = new URL(API_BASE)
	url.hostname = url.hostname.replace(/^[^.]+\./, `${name}.`)
	return url.origin
}

const SESSION_KEY = 'recall.session'

const session = {
	read() {
		try {
			return JSON.parse(localStorage.getItem(SESSION_KEY) || 'null')
		} catch {
			return null
		}
	},
	write(value) {
		try {
			localStorage.setItem(SESSION_KEY, JSON.stringify(value))
		} catch {}
	},
	clear() {
		try {
			localStorage.removeItem(SESSION_KEY)
		} catch {}
	},
}

/** POST username/password to the server's token endpoint. Throws with a readable reason. */
async function signIn(username, password) {
	let response
	try {
		response = await fetch(`${serviceHost('auth')}/connect/token`, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ grant_type: 'password', username, password, client_id: 'web' }),
		})
	} catch {
		throw new Error(
			'Could not reach the Recall server. It has to be online and served over HTTPS with a certificate your browser trusts.'
		)
	}
	const body = await response.json().catch(() => ({}))
	if (!response.ok) {
		throw new Error(body.error_description || body.error || 'That username and password did not work.')
	}
	return { username, token: body.access_token, accountId: body.account_id ?? null }
}

/** Swaps the Log in / Download buttons for the signed-in player's name. */
function paintAccount() {
	const slot = document.querySelector('[data-account]')
	if (!slot) return
	const who = session.read()
	slot.replaceChildren()
	if (!who) {
		const login = document.createElement('a')
		login.className = 'pill ghost'
		login.href = 'login.html'
		login.textContent = 'Log in'
		const download = document.createElement('a')
		download.className = 'pill solid'
		download.href = 'download.html'
		download.textContent = 'Download'
		slot.append(login, download)
		return
	}
	const name = document.createElement('span')
	name.className = 'signed-in'
	name.textContent = who.username
	const out = document.createElement('button')
	out.className = 'pill ghost'
	out.type = 'button'
	out.textContent = 'Log out'
	out.addEventListener('click', () => {
		session.clear()
		location.reload()
	})
	const download = document.createElement('a')
	download.className = 'pill solid'
	download.href = 'download.html'
	download.textContent = 'Download'
	slot.append(name, out, download)
}

document.addEventListener('DOMContentLoaded', paintAccount)
