/* Avatar picker for live multiplayer.
   250 avatars = 25 roles x 10 looks. The player picks a role (the skill and animation),
   then a look. Avatars other players already hold are disabled. */

import { AVATARS, AVATAR_COUNT, avatarSvg } from './mp-avatars.js';

const ROLES = AVATARS.slice(0, 25);
const ROLE_COUNT = ROLES.length;
const LOOK_COUNT = AVATAR_COUNT / ROLE_COUNT;

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const clamp = id => Math.min(AVATAR_COUNT - 1, Math.max(0, Number.isInteger(+id) ? +id : 0));
const lookName = a => a.name.slice(0, a.name.length - a.role.length - 1);
const idFor = (look, role) => look * ROLE_COUNT + role;

export const avatarInfo = id => AVATARS[clamp(id)];

/* A random avatar that nobody has taken. `taken` is a Set of avatar ids. */
export function randomFree(taken = new Set()) {
  const free = [];
  for (let i = 0; i < AVATAR_COUNT; i++) if (!taken.has(i)) free.push(i);
  return free.length ? free[Math.floor(Math.random() * free.length)] : 0;
}

export function createPicker(host, { taken = new Set(), value, onChange } = {}) {
  let blocked = new Set(taken);
  let sel = blocked.has(clamp(value)) || value === undefined ? randomFree(blocked) : clamp(value);

  const role = () => sel % ROLE_COUNT;
  const look = () => Math.floor(sel / ROLE_COUNT);

  host.innerHTML = `<div class="picker">
    <div class="pv"><div class="big-av" data-r="big"></div><div class="pv-t"><b data-r="name"></b><span data-r="skill"></span></div></div>
    <div>
      <div class="roles" role="group" aria-label="Skill"></div>
      <div class="looks" role="group" aria-label="Look"></div>
      <p class="picker-note">Pick a skill, then a look. Greyed looks are already taken in this room.</p>
    </div>
  </div>`;

  const $r = k => host.querySelector(`[data-r="${k}"]`);
  const rolesEl = host.querySelector('.roles');
  const looksEl = host.querySelector('.looks');

  rolesEl.innerHTML = ROLES.map((r, i) => `<button type="button" class="role" data-role="${i}" aria-pressed="false">${esc(r.role)}</button>`).join('');

  function paintLooks() {
    const r = role();
    looksEl.innerHTML = Array.from({ length: LOOK_COUNT }, (_, l) => {
      const id = idFor(l, r), info = AVATARS[id];
      return `<button type="button" class="look${id === sel ? ' on' : ''}" data-id="${id}" aria-pressed="${id === sel}" aria-label="${esc(info.name)}"${blocked.has(id) && id !== sel ? ' disabled' : ''}><span class="t">${avatarSvg(id, { still: true })}</span><small>${esc(lookName(info))}</small></button>`;
    }).join('');
  }

  function paint() {
    const info = AVATARS[sel];
    $r('big').innerHTML = avatarSvg(sel);
    $r('name').textContent = info.name;
    $r('skill').textContent = info.skill;
    rolesEl.querySelectorAll('.role').forEach(b => {
      const on = +b.dataset.role === role();
      b.classList.toggle('on', on);
      b.setAttribute('aria-pressed', String(on));
    });
    paintLooks();
  }

  function choose(id) {
    if (id === sel) return;
    sel = id;
    paint();
    if (onChange) onChange(sel);
  }

  rolesEl.addEventListener('click', e => {
    const b = e.target.closest('.role');
    if (!b) return;
    const r = +b.dataset.role;
    /* Keep the current look if it is free for this skill, otherwise take the first free look. */
    let l = look();
    if (blocked.has(idFor(l, r))) {
      l = Array.from({ length: LOOK_COUNT }, (_, i) => i).find(i => !blocked.has(idFor(i, r)));
      if (l === undefined) return;
    }
    choose(idFor(l, r));
    b.scrollIntoView({ block: 'nearest', inline: 'center' });
  });

  looksEl.addEventListener('click', e => {
    const b = e.target.closest('.look');
    if (b && !b.disabled) choose(+b.dataset.id);
  });

  paint();
  const active = rolesEl.querySelector('.role.on');
  if (active && active.scrollIntoView) active.scrollIntoView({ block: 'nearest', inline: 'center' });

  return {
    get: () => sel,
    set(id) { sel = clamp(id); paint(); },
    /* Called when the list of taken avatars changes. If ours was taken, move to a free one. */
    setTaken(next) {
      blocked = new Set(next);
      if (blocked.has(sel)) {
        sel = randomFree(blocked);
        paint();
        if (onChange) onChange(sel);
      } else paintLooks();
    }
  };
}
