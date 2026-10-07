import React from 'react';
import { act, fireEvent, render } from '@testing-library/react';
import BasemapImage from '../../components/BasemapImage';
import PlaceStaticMap from '../../components/PlaceStaticMap';
import { DEFAULT_SETTINGS } from '../../types';

beforeEach(() => jest.useFakeTimers());
afterEach(() => { jest.clearAllTimers(); jest.useRealTimers(); });

function exhaust(container: HTMLElement) {
  for (let i = 0; i < 4; i++) {
    fireEvent.error(container.querySelector('img')!);
    act(() => { jest.advanceTimersByTime(4500); });
  }
}

test('failed thumbnails can retry, recover online, and are not blacklisted on remount', () => {
  const view = render(<BasemapImage url="https://maps.test/recover" alt="map" />);
  exhaust(view.container);
  fireEvent.click(view.getByRole('button', { name: '重新加载地图' }));
  expect(view.container.querySelector('img')).not.toBeNull();
  exhaust(view.container);
  fireEvent(window, new Event('online'));
  expect(view.container.querySelector('img')).not.toBeNull();
  exhaust(view.container);
  view.unmount();
  const fresh = render(<BasemapImage url="https://maps.test/recover" alt="map" />);
  expect(fresh.container.querySelector('img')).not.toBeNull();
});

test('waits until near the viewport before starting request or timeout, and clears timers', () => {
  let notify: IntersectionObserverCallback;
  const disconnect = jest.fn();
  global.IntersectionObserver = jest.fn((cb) => {
    notify = cb;
    return { observe: jest.fn(), disconnect };
  }) as any;
  const view = render(<BasemapImage url="https://maps.test/visible" alt="map" />);
  act(() => { jest.advanceTimersByTime(90000); });
  expect(view.container.querySelector('img')).toBeNull();
  act(() => notify!([{ isIntersecting: true }] as any, {} as any));
  expect(view.container.querySelector('img')).not.toBeNull();
  act(() => { jest.advanceTimersByTime(20000); });
  act(() => { jest.advanceTimersByTime(1000); });
  expect(view.container.querySelector('img')!.src).toContain('_r=');
  view.unmount();
  expect(disconnect).toHaveBeenCalled();
  expect(jest.getTimerCount()).toBe(0);
  delete (global as any).IntersectionObserver;
});

test('remount reuses a successful retry URL instead of fetching the failed original', () => {
  const url = 'https://maps.test/cache';
  const first = render(<BasemapImage url={url} alt="map" />);
  fireEvent.error(first.container.querySelector('img')!);
  act(() => { jest.advanceTimersByTime(1000); });
  const img = first.container.querySelector('img')!;
  const src = img.src;
  fireEvent.load(img);
  act(() => { jest.advanceTimersByTime(25000); });
  expect(first.container.querySelector('img')).not.toBeNull();
  first.unmount();
  const second = render(<BasemapImage url={url} alt="map" />);
  expect(second.container.querySelector('img')!.src).toBe(src);
});

test('place list and editor use identical cache URLs; changed coordinates get a new map', () => {
  const props = { places: [{ lat: 40, lng: 111 }], currentIndex: 0, placeName: 'test',
    settings: { ...DEFAULT_SETTINGS, mapApiProvider: 'gaode' as const, gaodeWebServiceKey: 'test' } };
  const view = render(<PlaceStaticMap {...props} mapKey="list" />);
  const src = view.container.querySelector('img')!.src;
  view.rerender(<PlaceStaticMap {...props} mapKey="editor" />);
  expect(view.container.querySelector('img')!.src).toBe(src);
  view.rerender(<PlaceStaticMap {...props} places={[{ lat: 41, lng: 112 }]} mapKey="editor" />);
  expect(view.container.querySelector('img')!.src).not.toBe(src);
});
