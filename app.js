// Front page behaviour. data.json is a snapshot of the Recall server: public camera
// photos (who took them, which room, their caption) and the public room list. The feed
// shows a random set, swaps a post every few seconds while "Live" is on, and re-reads
// data.json now and then so photos taken since the page loaded turn up on their own.

const FEED_SIZE = 6
const SIDE_ROOMS = 5
const SWAP_MS = 9000
const REFETCH_MS = 60000

let data = { rooms: [], photos: [] }
let shown = []

const shuffled = (list) => {
	const copy = [...list]
	for (let i = copy.length - 1; i > 0; i--) {
		const j = Math.floor(Math.random() * (i + 1))
		;[copy[i], copy[j]] = [copy[j], copy[i]]
	}
	return copy
}

// Stable colour per name, so a room or player keeps its look between shuffles.
const hueOf = (text) => {
	let hash = 0
	for (const ch of text) hash = (hash * 31 + ch.charCodeAt(0)) % 360
	return hash
}
const artOf = (text) => {
	const h = hueOf(text)
	return `linear-gradient(145deg, hsl(${h} 58% 42%), hsl(${(h + 40) % 360} 55% 26%))`
}

const el = (tag, className, text) => {
	const node = document.createElement(tag)
	if (className) node.className = className
	if (text !== undefined) node.textContent = text
	return node
}

const sinceText = (iso) => {
	const days = Math.floor((Date.now() - Date.parse(iso + 'T12:00:00Z')) / 86400000)
	if (!Number.isFinite(days)) return iso
	if (days <= 0) return 'today'
	if (days === 1) return 'yesterday'
	if (days < 30) return `${days} days ago`
	return iso
}

/* ---------- feed ---------- */

function postNode(photo, openPhoto) {
	const post = el('article', 'post')

	const top = el('div', 'post-top')
	const avatar = el('div', 'avatar', (photo.author[0] || '?').toUpperCase())
	avatar.style.setProperty('--art', artOf(photo.author))
	const who = el('div', 'who')
	const name = el('div', 'name', photo.author)
	name.append(el('span', 'handle', `@${photo.author}`))
	who.append(name)
	if (photo.roomRef) who.append(el('div', 'where', photo.roomRef))
	top.append(avatar, who)

	const shot = el('button', 'post-shot')
	shot.type = 'button'
	const img = el('img')
	img.src = photo.src
	img.loading = 'lazy'
	img.alt = photo.caption || `Photo by ${photo.author}${photo.room ? ` in ${photo.room}` : ''}`
	shot.append(img)
	shot.addEventListener('click', () => openPhoto(photo))

	const foot = el('div', 'post-foot')
	foot.append(el('div', 'cheers', `${photo.cheers} cheer${photo.cheers === 1 ? '' : 's'}`))
	if (photo.caption) foot.append(el('p', 'caption', photo.caption))
	foot.append(el('p', 'stamp', sinceText(photo.taken)))

	post.append(top, shot, foot, commentsNode(photo))
	return post
}

/* ---------- comments ---------- */

function commentsNode(photo) {
	const box = el('section', 'comments')
	box.append(el('h4', null, 'Comments'))
	const list = el('div', 'comment-list')
	box.append(list)

	const draw = (comments) => {
		list.replaceChildren()
		if (!comments.length) {
			list.append(el('p', 'comment-locked', 'No comments yet.'))
			return
		}
		for (const comment of comments) {
			const row = el('div', 'comment')
			row.append(el('span', 'by', comment.author), el('span', 'text', comment.text))
			list.append(row)
		}
	}
	draw([])
	loadComments(photo.id).then(draw).catch(() => {})

	const who = session.read()
	if (!who) {
		const locked = el('p', 'comment-locked')
		const link = el('a', null, 'Log in')
		link.href = 'login.html'
		locked.append(link, document.createTextNode(' to leave a comment.'))
		box.append(locked)
		return box
	}

	const form = el('form', 'comment-form')
	const input = el('input')
	input.placeholder = `Comment as ${who.username}…`
	input.maxLength = 300
	const send = el('button', 'pill solid', 'Post')
	send.type = 'submit'
	form.append(input, send)
	const note = el('p', 'comment-note')
	note.hidden = true
	form.addEventListener('submit', async (e) => {
		e.preventDefault()
		const text = input.value.trim()
		if (!text) return
		send.disabled = true
		try {
			await postComment(photo.id, text, who)
			input.value = ''
			draw(await loadComments(photo.id))
			note.hidden = true
		} catch (err) {
			note.textContent = err.message
			note.hidden = false
		}
		send.disabled = false
	})
	box.append(form, note)
	return box
}

/* ---------- rooms ---------- */

function roomArt(room) {
	const art = el('div', 'art')
	art.style.setProperty('--art', artOf(room.name))
	if (room.photo) {
		const img = el('img')
		img.src = room.photo
		img.alt = ''
		img.loading = 'lazy'
		art.append(img)
	} else {
		art.append(el('span', null, room.name))
	}
	return art
}

function sideRoom(room) {
	const wrap = el('div', 'side-room')
	const art = roomArt(room)
	wrap.append(art, el('p', 'name', `^${room.name}`), el('p', 'by', room.kind))
	return wrap
}

function roomCard(room) {
	const card = el('article', 'room-card')
	const art = roomArt(room)
	const body = el('div', 'body')
	body.append(el('h3', null, `^${room.name}`))
	const meta = [`${room.visits.toLocaleString()} visit${room.visits === 1 ? '' : 's'}`]
	if (room.maxPlayers) meta.push(`up to ${room.maxPlayers}`)
	body.append(el('p', 'meta', meta.join(' · ')))
	const tags = el('div', 'tags')
	for (const tag of room.platforms) tags.append(el('span', null, tag))
	body.append(tags)
	card.append(art, body)
	return card
}

/* ---------- wiring ---------- */

const feedEl = document.querySelector('[data-feed]')
const sideEl = document.querySelector('[data-side-rooms]')
const roomsEl = document.querySelector('[data-rooms]')
const roomsPanel = document.querySelector('[data-rooms-panel]')
const columns = document.querySelector('.columns')
const liveBox = document.querySelector('[data-live]')
const lightbox = document.querySelector('[data-lightbox]')
const lightboxImg = lightbox.querySelector('img')

const openPhoto = (photo) => {
	lightboxImg.src = photo.src
	lightboxImg.alt = photo.caption || `Photo by ${photo.author}`
	lightbox.hidden = false
}
const closePhoto = () => {
	lightbox.hidden = true
	lightboxImg.src = ''
}
lightbox.addEventListener('click', closePhoto)
document.addEventListener('keydown', (e) => e.key === 'Escape' && closePhoto())

document.querySelector('[data-notice-close]').addEventListener('click', () => {
	document.querySelector('[data-notice]').hidden = true
})

for (const tab of document.querySelectorAll('.tab')) {
	tab.addEventListener('click', () => {
		for (const other of document.querySelectorAll('.tab')) other.classList.toggle('is-on', other === tab)
		const roomsView = tab.dataset.tab === 'rooms'
		roomsPanel.hidden = !roomsView
		columns.hidden = roomsView
	})
}

function drawFeed() {
	if (!data.photos.length) {
		feedEl.replaceChildren(el('p', 'empty', 'No photos have been shared yet.'))
		return
	}
	shown = shuffled(data.photos).slice(0, FEED_SIZE)
	feedEl.replaceChildren(...shown.map((p) => postNode(p, openPhoto)))
}

function drawRooms() {
	sideEl.replaceChildren(...shuffled(data.rooms).slice(0, SIDE_ROOMS).map(sideRoom))
	roomsEl.replaceChildren(...data.rooms.map(roomCard))
}

// Swap one post for a photo that isn't on screen, so the feed keeps moving.
function swapOne() {
	if (!liveBox.checked || document.hidden || data.photos.length <= FEED_SIZE) return
	const fresh = shuffled(data.photos).find((p) => !shown.some((s) => s.src === p.src))
	if (!fresh) return
	const slot = Math.floor(Math.random() * shown.length)
	shown[slot] = fresh
	feedEl.children[slot]?.replaceWith(postNode(fresh, openPhoto))
}

document.querySelector('[data-reroll]').addEventListener('click', drawRooms)

async function load(first) {
	try {
		const fetched = await (await fetch(`data.json?t=${Date.now()}`, { cache: 'no-store' })).json()
		const isNew = fetched.photos.length !== data.photos.length
		data = fetched
		if (first) {
			drawFeed()
			drawRooms()
		} else if (isNew) {
			drawFeed() // new photos arrived on the server
		}
	} catch {
		if (first) feedEl.replaceChildren(el('p', 'empty', 'Could not reach the photo feed.'))
	}
}

load(true)
setInterval(swapOne, SWAP_MS)
setInterval(() => load(false), REFETCH_MS)

/* Comments live on the Recall server, so they need it reachable from the browser (see
 * site.js). Until then reads come back empty and posting reports why. */

const commentsUrl = (id) => service('api', `/api/images/v1/${id}/comments`)

async function loadComments(id) {
	try {
		const response = await fetch(commentsUrl(id), { cache: 'no-store' })
		if (!response.ok) return []
		const body = await response.json()
		// The server serves a photo's comments PascalCase, as it serves the photo itself.
		return (Array.isArray(body) ? body : []).map((row) => ({
			author: row.Author ?? 'player',
			text: row.Body ?? '',
		}))
	} catch {
		return []
	}
}

async function postComment(id, text, who) {
	let response
	try {
		response = await fetch(commentsUrl(id), {
			method: 'POST',
			headers: {
				'content-type': 'application/json',
				...(who.token ? { authorization: `Bearer ${who.token}` } : {}),
			},
			body: JSON.stringify({ text }),
		})
	} catch {
		throw new Error('Could not reach the Recall server, so the comment was not saved.')
	}
	if (!response.ok) throw new Error('The server would not accept the comment.')
	return response.json().catch(() => ({}))
}
