import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createService, dispatch } from '../../supabase/functions/_shared/service.js';
import { createMemoryRepo } from '../api/memoryRepo.js';
import { ApiError, createListStore, UNDO_MS } from './listStore.js';

// «Сервер» в памяти и «сеть», которую можно выключить.
function makeWorld() {
  let seq = 0;
  const service = createService({ repo: createMemoryRepo(), randomId: () => `fam${++seq}` });
  const net = { online: true };
  const apiFor = (user) => {
    const call = async (action, params) => {
      if (!net.online) throw new ApiError('network');
      return structuredClone(await dispatch(service, user, { action, ...params }));
    };
    return {
      bootstrap: () => call('bootstrap'),
      sync: (p) => call('sync', p),
      createInvite: () => call('createInvite'),
      previewInvite: (p) => call('previewInvite', p),
      acceptInvite: (p) => call('acceptInvite', p),
      leaveFamily: () => call('leaveFamily'),
    };
  };
  return { net, apiFor };
}

function memoryStorage() {
  const m = new Map();
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v) };
}

const anya = { id: 1, firstName: 'Аня' };
const petya = { id: 2, firstName: 'Петя' };

let world;
beforeEach(() => {
  vi.useFakeTimers();
  world = makeWorld();
});

function phone(user, storage = memoryStorage()) {
  return createListStore({ api: world.apiFor(user), storage, storageKey: `sl:${user.id}` });
}

async function settle() {
  await vi.runAllTimersAsync();
}

async function pair() {
  const a = phone(anya);
  const p = phone(petya);
  await a.init();
  await p.init();
  const { token } = await a.createInvite();
  await p.acceptInvite(token);
  return { a, p };
}

describe('два телефона', () => {
  it('добавленное на одном видно на другом после обновления', async () => {
    const { a, p } = await pair();
    a.add({ name: 'Хлеб', unit: 'шт' });
    await settle();
    await p.refresh();
    expect(p.getState().items.map((i) => i.name)).toEqual(['Хлеб']);
    expect(p.getState().items[0].addedBy.name).toBe('Аня');
  });

  it('офлайн: правки копятся в очереди и уходят, когда появилась сеть', async () => {
    const { a, p } = await pair();
    world.net.online = false;
    a.add({ name: 'Молоко', unit: 'л' });
    await settle();
    expect(a.getState().online).toBe(false);
    expect(a.getState().pending).toBe(1);
    expect(a.getState().items.map((i) => i.name)).toEqual(['Молоко']); // видно сразу

    world.net.online = true;
    a.setOnline(true);
    await settle();
    expect(a.getState().pending).toBe(0);
    await p.refresh();
    expect(p.getState().items.map((i) => i.name)).toEqual(['Молоко']);
  });

  it('без сети открывается последний сохранённый список', async () => {
    const storage = memoryStorage();
    const a = phone(anya, storage);
    await a.init();
    a.add({ name: 'Яйца', unit: 'уп' });
    await settle();

    world.net.online = false;
    const reopened = phone(anya, storage);
    await reopened.init();
    expect(reopened.getState().status).toBe('ready');
    expect(reopened.getState().items.map((i) => i.name)).toEqual(['Яйца']);
  });

  it('первый вход без сети — понятная ошибка', async () => {
    world.net.online = false;
    const a = phone(anya);
    await a.init();
    expect(a.getState()).toMatchObject({ status: 'error', error: 'offline_first_run' });
  });

  it('оба офлайн меняли количество — побеждает последняя правка', async () => {
    const { a, p } = await pair();
    a.add({ name: 'Молоко', unit: 'шт' });
    await settle();
    await p.refresh();
    const id = p.getState().items[0].id;

    world.net.online = false;
    a.inc(id); // 2
    await settle();
    p.inc(id);
    p.inc(id); // 3, позже
    await settle();

    world.net.online = true;
    a.setOnline(true);
    await settle();
    p.setOnline(true);
    await settle();
    await a.refresh();
    expect(a.getState().items[0].qty).toBe(3);
    expect(p.getState().items[0].qty).toBe(3);
  });
});

describe('удаление с отменой', () => {
  it('«Отменить» возвращает товар, и на сервер ничего не уходит', async () => {
    const a = phone(anya);
    await a.init();
    a.add({ name: 'Сыр', unit: 'г' });
    await settle();
    const id = a.getState().items[0].id;

    a.remove(id);
    expect(a.getState().items).toHaveLength(0);
    a.undo();
    expect(a.getState().items).toHaveLength(1);
    await settle();
    expect(a.getState().pending).toBe(0);
  });

  it('через 5 секунд удаление фиксируется', async () => {
    const a = phone(anya);
    await a.init();
    a.add({ name: 'Сыр', unit: 'г' });
    await settle();
    a.remove(a.getState().items[0].id);
    await vi.advanceTimersByTimeAsync(UNDO_MS + 1000);
    await a.refresh();
    expect(a.getState().items).toHaveLength(0);
    expect(a.getState().undo).toBeNull();
  });

  it('«Очистить купленное» убирает только купленное', async () => {
    const a = phone(anya);
    await a.init();
    a.add({ name: 'Хлеб', unit: 'шт' });
    a.add({ name: 'Сок', unit: 'л' });
    await settle();
    const bread = a.getState().items.find((i) => i.name === 'Хлеб');
    a.toggleDone(bread.id);
    a.clearDone();
    await vi.advanceTimersByTimeAsync(UNDO_MS + 1000);
    expect(a.getState().items.map((i) => i.name)).toEqual(['Сок']);
  });
});
