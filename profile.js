// A player's profile page: `profile.html?id=<accountId>`.
//
// Everything here is read live from the Recall server — the account and bio from
// `accounts`, the photos from `api` and the rooms from `rooms` — because none of it is in
// the build's data.json snapshot, which only carries what the front page shows. So the
// page needs the server reachable from the browser (see site.js); when it isn't, it says
// so instead of rendering an empty profile.
//
// Photos and rooms are both fetched up front but the rooms tab is only drawn when it is
// opened, so a player with no rooms costs nothing to look at.

const PROFILE_PHOTOS = 60

const profileEl = document.querySelector('[data-profile]')
const profileLightbox = document.querySelector('[data-lightbox]')
const profileLightboxImg = profileLightbox.querySelector('img')

const openProfilePhoto = (src, alt) => {
	profileLightboxImg.src = src
	profileLightboxImg.alt = alt
	profileLightbox.hidden = false
}
profileLightbox.addEventListener('click', () => {
	profileLightbox.hidden = true
	profileLightboxImg.src = ''
})
document.addEventListener('keydown', (e) => e.key === 'Escape' && (profileLightbox.hidden = true))

/** "Joined August 11 2022" — the account DTO's createdAt, which is an ISO timestamp. */
function joinedText(createdAt) {
	const when = new Date(createdAt)
	if (Number.isNaN(when.getTime())) return ''
	return `Joined ${when.toLocaleDateString('en-US', {
		month: 'long',
		day: 'numeric',
		year: 'numeric',
		timeZone: 'UTC',
	})}`
}

async function readJson(url) {
	const response = await fetch(url, { cache: 'no-store' })
	if (!response.ok) throw new Error(`${response.status}`)
	return response.json()
}

/* ---------- the parts of the page ---------- */

function bannerNode(account) {
	const banner = el('div', 'profile-banner')
	banner.style.setProperty('--art', artOf(account.username))
	const src = imageUrl(account.bannerImage)
	if (src) {
		const img = el('img')
		img.src = src
		img.alt = ''
		img.addEventListener('error', () => img.remove())
		banner.append(img)
	}
	return banner
}

function headNode(account, bio) {
	const head = el('section', 'profile-head')
	head.append(bannerNode(account))

	const bar = el('div', 'profile-bar')
	bar.append(avatarNode(account.username, account.profileImage, 'profile-pfp'))

	const who = el('div', 'profile-who')
	who.append(el('h1', null, account.displayName || account.username))
	const handle = el('p', 'profile-handle', `@${account.username}`)
	if (account.displayEmoji) handle.append(el('span', 'profile-emoji', account.displayEmoji))
	who.append(handle)
	bar.append(who)
	head.append(bar)

	const about = el('div', 'profile-about')
	about.append(el('p', 'profile-bio', bio || 'This player has not written a bio.'))
	const joined = joinedText(account.createdAt)
	if (joined) about.append(el('p', 'profile-joined', joined))
	head.append(about)
	return head
}

function photoTile(image) {
	const src = imageUrl(image.ImageName)
	const tile = el('button', 'profile-photo')
	tile.type = 'button'
	const img = el('img')
	img.src = src
	img.loading = 'lazy'
	img.alt = image.Description || 'Photo'
	img.addEventListener('error', () => tile.remove())
	tile.append(img)
	if (image.CheerCount) tile.append(el('span', 'profile-photo-cheers', `${image.CheerCount}`))
	tile.addEventListener('click', () => openProfilePhoto(src, img.alt))
	return tile
}

function roomTile(room) {
	const card = el('article', 'room-card')
	const art = el('div', 'art')
	art.style.setProperty('--art', artOf(room.Name))
	const src = imageUrl(room.ImageName)
	if (src) {
		const img = el('img')
		img.src = src
		img.alt = ''
		img.loading = 'lazy'
		img.addEventListener('error', () => {
			img.remove()
			art.append(el('span', null, room.Name))
		})
		art.append(img)
	} else {
		art.append(el('span', null, room.Name))
	}
	const body = el('div', 'body')
	body.append(el('h3', null, `^${room.Name}`))
	const visits = room.Stats?.VisitCount ?? 0
	const meta = [`${visits.toLocaleString()} visit${visits === 1 ? '' : 's'}`]
	if (room.MaxPlayers) meta.push(`up to ${room.MaxPlayers}`)
	body.append(el('p', 'meta', meta.join(' · ')))
	card.append(art, body)
	return card
}

/** Photos / Rooms, with the counts the server actually returned on the tab itself. */
function tabsNode(photos, rooms) {
	const wrap = el('section', 'profile-tabs-wrap')
	const tabs = el('div', 'tabs')
	const panel = el('div', 'profile-panel')

	const views = {
		photos: () =>
			photos.length
				? [gridOf('profile-photos', photos.map(photoTile))]
				: [el('p', 'empty', 'No public photos yet.')],
		rooms: () =>
			rooms.length
				? [gridOf('rooms-grid', rooms.map(roomTile))]
				: [el('p', 'empty', 'No public rooms yet.')],
	}

	for (const [key, label] of [
		['photos', `Photos (${photos.length})`],
		['rooms', `Rooms (${rooms.length})`],
	]) {
		const tab = el('button', 'tab', label)
		tab.type = 'button'
		tab.addEventListener('click', () => {
			for (const other of tabs.children) other.classList.toggle('is-on', other === tab)
			panel.replaceChildren(...views[key]())
		})
		tabs.append(tab)
	}
	tabs.firstChild.classList.add('is-on')
	panel.replaceChildren(...views.photos())

	wrap.append(tabs, panel)
	return wrap
}

function gridOf(className, children) {
	const grid = el('div', className)
	grid.append(...children)
	return grid
}

/* ---------- load ---------- */

async function loadProfile() {
	const id = new URLSearchParams(location.search).get('id')
	if (!id || !/^[0-9]+$/.test(id)) {
		profileEl.replaceChildren(el('p', 'empty', 'No player was named. Use search to find one.'))
		return
	}

	let account
	try {
		account = await readJson(service('accounts', `/account/${id}`))
	} catch {
		profileEl.replaceChildren(
			el(
				'p',
				'empty',
				'Profiles are read live from the Recall server, and it could not be reached right now.'
			)
		)
		return
	}

	// The bio, photos and rooms are each optional furniture: a profile still renders
	// without any of them, so one failing read must not take the page down with it.
	const [bio, photos, rooms] = await Promise.all([
		readJson(service('accounts', `/account/${id}/bio`))
			.then((body) => body.bio ?? '')
			.catch(() => ''),
		readJson(service('api', `/api/images/v4/player/${id}?take=${PROFILE_PHOTOS}`)).catch(() => []),
		readJson(service('rooms', `/rooms/ownedby/${id}`)).catch(() => []),
	])

	document.title = `${account.displayName || account.username} · Recall`
	profileEl.replaceChildren(
		headNode(account, bio),
		tabsNode(Array.isArray(photos) ? photos : [], Array.isArray(rooms) ? rooms : [])
	)
}

loadProfile()
