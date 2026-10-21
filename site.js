// Shared bits: where the Recall server lives, and the signed-in session.
//
// The pages talk to the Recall server directly from the browser, so it has to answer on
// HTTPS with a certificate the browser trusts — the server's own dev certificate is
// self-signed and would be refused before any request went out. It is published through a
// Cloudflare tunnel instead, and one hostname reaches every service: `/-/<service>/<path>`
// names the service in the path, which the server's router strips.
//
// A quick tunnel gets a new name each time it is restarted. When that happens, put the new
// one here and rebuild.

const API_BASE = 'https://roses-span-trainers-feet.trycloudflare.com'

const service = (name, path) => `${API_BASE}/-/${name}${path}`

const SESSION_KEY = 'recall.session'

/* ---------- player images ----------
 *
 * Profile pictures, banners and room tiles are R2 keys the account/room record names, and
 * the `img` service streams them by key. An account that never set one carries the game's
 * own `DefaultProfileImage.jpg`; the site draws its own initial tile for those rather than
 * republishing the official artwork, and falls back to the same tile when the server is
 * unreachable and the <img> fails to load. */

const DEFAULT_IMAGES = /^(DefaultProfileImage|DefaultRoomImage|DefaultBannerImage)\./i

/** Absolute URL for an image key, or '' for an unset / stock one. */
const imageUrl = (key) => (!key || DEFAULT_IMAGES.test(key) ? '' : service('img', `/${key}`))

const profileHref = (accountId) => `profile.html?id=${encodeURIComponent(accountId)}`

const el = (tag, className, text) => {
	const node = document.createElement(tag)
	if (className) node.className = className
	if (text !== undefined) node.textContent = text
	return node
}

// Stable colour per name, so a player or room keeps its look between page loads.
const hueOf = (text) => {
	let hash = 0
	for (const ch of String(text)) hash = (hash * 31 + ch.charCodeAt(0)) % 360
	return hash
}
const artOf = (text) => {
	const h = hueOf(text)
	return `linear-gradient(145deg, hsl(${h} 58% 42%), hsl(${(h + 40) % 360} 55% 26%))`
}

/**
 * An avatar tile: the player's real profile picture when they have one, otherwise their
 * initial on a colour derived from the name. A picture that fails to load (server down)
 * is removed, which leaves the initial showing underneath.
 */
function avatarNode(name, imageKey, className = 'avatar') {
	const node = document.createElement('div')
	node.className = className
	node.textContent = (String(name || '?')[0] || '?').toUpperCase()
	node.style.setProperty('--art', artOf(name || '?'))
	const src = imageUrl(imageKey)
	if (src) {
		const img = document.createElement('img')
		img.src = src
		img.alt = ''
		img.loading = 'lazy'
		img.addEventListener('error', () => img.remove())
		node.append(img)
	}
	return node
}

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
		response = await fetch(service('auth', '/connect/token'), {
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
		// The server answers an unknown username with the same "account_id or username is
		// required" it gives a request that named nobody at all; both read as a bad login here.
		const reason = String(body.error_description || body.error || '')
		throw new Error(
			/required|invalid_grant|password/i.test(reason)
				? 'That username and password did not work.'
				: reason || 'Could not log in.'
		)
	}
	return { username, token: body.access_token, accountId: body.account_id ?? null }
}

/** The magnifier that opens the search overlay (search.js listens for the click). */
function searchButton() {
	const button = el('button', 'pill ghost icon')
	button.type = 'button'
	button.title = 'Search'
	button.setAttribute('aria-label', 'Search')
	button.dataset.searchOpen = ''
	button.innerHTML =
		'<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">' +
		'<circle cx="11" cy="11" r="6.5" fill="none" stroke="currentColor" stroke-width="2.2" />' +
		'<line x1="16" y1="16" x2="21" y2="21" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" />' +
		'</svg>'
	return button
}

/** Swaps the Log in / Download buttons for the signed-in player's name. */
function paintAccount() {
	const slot = document.querySelector('[data-account]')
	if (!slot) return
	const who = session.read()
	slot.replaceChildren(searchButton())
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
	// Signed in with a known id: the name is the way to your own profile page.
	const name = document.createElement(who.accountId ? 'a' : 'span')
	name.className = 'signed-in'
	name.textContent = who.username
	if (who.accountId) name.href = profileHref(who.accountId)
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
