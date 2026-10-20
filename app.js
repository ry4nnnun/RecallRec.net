// Front page behaviour: pick a random set of rooms and photos from data.json on every
// load, with Shuffle buttons to re-roll. Everything is static — data.json is a snapshot
// of the Recall server, rebuilt by build.py.

const ROOM_COUNT = 8
const PHOTO_COUNT = 9

const pick = (list, n) => {
	const copy = [...list]
	for (let i = copy.length - 1; i > 0; i--) {
		const j = Math.floor(Math.random() * (i + 1))
		;[copy[i], copy[j]] = [copy[j], copy[i]]
	}
	return copy.slice(0, n)
}

// Deterministic per-room artwork, so a room keeps its colours between shuffles.
const artFor = (name) => {
	let hash = 0
	for (const ch of name) hash = (hash * 31 + ch.charCodeAt(0)) % 360
	const a = hash
	const b = (hash + 48) % 360
	return `linear-gradient(140deg, hsl(${a} 72% 46%), hsl(${b} 68% 28%))`
}

const plural = (n, word) => `${n.toLocaleString()} ${word}${n === 1 ? '' : 's'}`

function roomCard(room) {
	const card = document.createElement('div')
	card.className = 'room'
	card.style.setProperty('--art', artFor(room.name))
	const meta = [plural(room.visits, 'visit')]
	if (room.maxPlayers) meta.push(`up to ${room.maxPlayers} players`)
	card.innerHTML = `
		<span class="kind">${room.kind}</span>
		<h3></h3>
		<p class="meta"></p>
		<div class="tags"></div>`
	card.querySelector('h3').textContent = room.name
	card.querySelector('.meta').textContent = meta.join(' · ')
	for (const tag of room.platforms) {
		const el = document.createElement('span')
		el.textContent = tag
		card.querySelector('.tags').append(el)
	}
	return card
}

function photoCard(photo, onOpen) {
	const button = document.createElement('button')
	button.className = 'photo'
	button.type = 'button'
	const img = document.createElement('img')
	img.src = photo.src
	img.alt = `Photo taken in Recall on ${photo.taken}`
	img.loading = 'lazy'
	const label = document.createElement('span')
	label.textContent = photo.taken
	button.append(img, label)
	button.addEventListener('click', () => onOpen(photo))
	return button
}

function render(data) {
	const roomsEl = document.querySelector('[data-rooms]')
	const photosEl = document.querySelector('[data-photos]')
	const lightbox = document.querySelector('[data-lightbox]')
	const lightboxImg = lightbox.querySelector('img')

	const openPhoto = (photo) => {
		lightboxImg.src = photo.src
		lightboxImg.alt = `Photo taken in Recall on ${photo.taken}`
		lightbox.hidden = false
	}
	const closePhoto = () => {
		lightbox.hidden = true
		lightboxImg.src = ''
	}
	lightbox.addEventListener('click', closePhoto)
	document.addEventListener('keydown', (e) => e.key === 'Escape' && closePhoto())

	const drawRooms = () => {
		roomsEl.replaceChildren(...pick(data.rooms, ROOM_COUNT).map(roomCard))
	}
	const drawPhotos = () => {
		const chosen = pick(data.photos, PHOTO_COUNT)
		photosEl.replaceChildren(...chosen.map((p) => photoCard(p, openPhoto)))
		// The hero collage borrows the first few shots.
		document.querySelectorAll('.shot').forEach((shot, i) => {
			const photo = chosen[i] ?? data.photos[i]
			if (photo) shot.style.backgroundImage = `url("${photo.src}")`
		})
	}

	document.querySelector('[data-reroll]').addEventListener('click', drawRooms)
	document.querySelector('[data-shuffle-photos]').addEventListener('click', drawPhotos)
	document.querySelector('[data-stat="rooms"]').textContent = data.rooms.length
	document.querySelector('[data-stat="photos"]').textContent = data.photos.length
	drawRooms()
	drawPhotos()
}

fetch('data.json')
	.then((r) => r.json())
	.then(render)
	.catch(() => {
		for (const el of document.querySelectorAll('.empty')) {
			el.textContent = 'Could not load the room list.'
		}
	})
