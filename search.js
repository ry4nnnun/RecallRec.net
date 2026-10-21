// The search overlay behind the magnifier in the top bar, on every page.
//
// Two tabs, answered from two different places on purpose:
//
//   People — the live Recall server (`accounts` /account/search?name=), so results carry
//            the player's real profile picture and account id and lead to their profile.
//            Needs the server reachable from the browser (see site.js); when it isn't,
//            the tab says so rather than showing nothing.
//   Rooms  — data.json, the build's snapshot of the public room list. Static, so it keeps
//            working with the server offline.

const SEARCH_DEBOUNCE_MS = 220
const SEARCH_LIMIT = 24

const searchUi = buildSearchUi()
let searchRooms = null // data.json's room list, loaded the first time it's needed
let searchTab = 'people'
let searchSeq = 0 // only the newest request may paint

function buildSearchUi() {
	const root = el('div', 'search')
	root.hidden = true

	const panel = el('div', 'search-panel')
	const head = el('div', 'search-head')

	const field = el('div', 'search-field')
	const input = el('input')
	input.type = 'search'
	input.placeholder = 'Search'
	input.autocomplete = 'off'
	input.setAttribute('aria-label', 'Search Recall')
	const clear = el('button', 'search-clear', '×')
	clear.type = 'button'
	clear.title = 'Clear'
	clear.hidden = true
	field.append(input, clear)

	const close = el('button', 'search-close', '×')
	close.type = 'button'
	close.setAttribute('aria-label', 'Close search')
	head.append(field, close)

	const tabs = el('div', 'search-tabs')
	const tabButtons = {}
	for (const [key, label] of [
		['people', 'People'],
		['rooms', 'Rooms'],
	]) {
		const tab = el('button', 'search-tab', label)
		tab.type = 'button'
		tab.dataset.searchTab = key
		tabs.append(tab)
		tabButtons[key] = tab
	}

	const results = el('div', 'search-results')

	panel.append(head, tabs, results)
	root.append(panel)
	document.body.append(root)

	return { root, panel, input, clear, close, tabs, tabButtons, results }
}

/* ---------- opening and closing ---------- */

function openSearch() {
	searchUi.root.hidden = false
	document.body.classList.add('search-open')
	searchUi.input.focus()
	searchUi.input.select()
	runSearch()
}

function closeSearch() {
	searchUi.root.hidden = true
	document.body.classList.remove('search-open')
}

// The magnifier is painted into the top bar by site.js on DOMContentLoaded, which may run
// after this file, so listen on the document rather than on the button itself.
document.addEventListener('click', (event) => {
	if (event.target.closest('[data-search-open]')) {
		event.preventDefault()
		openSearch()
	}
})
searchUi.close.addEventListener('click', closeSearch)
searchUi.root.addEventListener('click', (event) => {
	if (event.target === searchUi.root) closeSearch() // clicked the backdrop
})
document.addEventListener('keydown', (event) => {
	if (event.key === 'Escape' && !searchUi.root.hidden) closeSearch()
})

searchUi.clear.addEventListener('click', () => {
	searchUi.input.value = ''
	searchUi.input.focus()
	runSearch()
})

for (const [key, tab] of Object.entries(searchUi.tabButtons)) {
	tab.addEventListener('click', () => {
		searchTab = key
		runSearch()
	})
}

let searchTimer = 0
searchUi.input.addEventListener('input', () => {
	clearTimeout(searchTimer)
	searchTimer = setTimeout(runSearch, SEARCH_DEBOUNCE_MS)
})

/* ---------- results ---------- */

function paintTabs() {
	for (const [key, tab] of Object.entries(searchUi.tabButtons)) {
		tab.classList.toggle('is-on', key === searchTab)
	}
}

/** The "nothing here" block, shaped like the game's own empty search. */
function searchEmpty(text) {
	const empty = el('div', 'search-empty')
	empty.append(el('div', 'search-empty-mark', '?'), el('p', null, text))
	return empty
}

function peopleRow(account) {
	const row = el('a', 'search-row')
	row.href = profileHref(account.accountId)
	row.append(avatarNode(account.username, account.profileImage, 'search-avatar'))
	const who = el('div', 'search-who')
	who.append(
		el('div', 'search-name', account.displayName || account.username),
		el('div', 'search-handle', `@${account.username}`)
	)
	row.append(who)
	return row
}

function roomRow(room) {
	const row = el('a', 'search-row')
	row.href = `index.html?room=${room.id}`
	const art = el('div', 'search-avatar square')
	art.style.setProperty('--art', artOf(room.name))
	if (room.photo) {
		const img = el('img')
		img.src = room.photo
		img.alt = ''
		img.loading = 'lazy'
		art.append(img)
	} else {
		art.textContent = (room.name[0] || '^').toUpperCase()
	}
	row.append(art)
	const who = el('div', 'search-who')
	who.append(
		el('div', 'search-name', `^${room.name}`),
		el(
			'div',
			'search-handle',
			`${room.kind} · ${room.visits.toLocaleString()} visit${room.visits === 1 ? '' : 's'}`
		)
	)
	row.append(who)
	return row
}

async function searchPeople(query) {
	const response = await fetch(service('accounts', `/account/search?name=${encodeURIComponent(query)}`), {
		cache: 'no-store',
	})
	if (!response.ok) throw new Error('search failed')
	const body = await response.json()
	return Array.isArray(body) ? body.slice(0, SEARCH_LIMIT) : []
}

async function roomList() {
	if (searchRooms) return searchRooms
	const response = await fetch('data.json', { cache: 'no-store' })
	searchRooms = (await response.json()).rooms ?? []
	return searchRooms
}

async function runSearch() {
	paintTabs()
	const query = searchUi.input.value.trim()
	searchUi.clear.hidden = !query
	const mine = ++searchSeq
	const paint = (...nodes) => {
		if (mine === searchSeq) searchUi.results.replaceChildren(...nodes)
	}

	if (!query) {
		paint(searchEmpty('Search for players by name, or rooms on the server.'))
		return
	}
	paint(el('p', 'search-note', 'Searching…'))

	if (searchTab === 'people') {
		let accounts
		try {
			accounts = await searchPeople(query)
		} catch {
			paint(
				searchEmpty(
					'Player search needs the Recall server, and it could not be reached right now.'
				)
			)
			return
		}
		paint(
			...(accounts.length ? accounts.map(peopleRow) : [searchEmpty(`No player matches "${query}".`)])
		)
		return
	}

	let rooms
	try {
		rooms = await roomList()
	} catch {
		paint(searchEmpty('Could not load the room list.'))
		return
	}
	const needle = query.toLowerCase().replace(/^\^/, '')
	const hits = rooms
		.filter((room) => room.name.toLowerCase().includes(needle))
		// A name that STARTS with what was typed is the one being looked for.
		.sort((a, b) => {
			const rank = (room) => (room.name.toLowerCase().startsWith(needle) ? 0 : 1)
			return rank(a) - rank(b) || b.visits - a.visits
		})
		.slice(0, SEARCH_LIMIT)
	paint(...(hits.length ? hits.map(roomRow) : [searchEmpty(`No room matches "${query}".`)]))
}
