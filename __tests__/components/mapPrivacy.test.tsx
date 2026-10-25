import React from 'react';
import { act, fireEvent, render } from '@testing-library/react';
import StaticMap from '../../components/StaticMap';
import PlaceStaticMap from '../../components/PlaceStaticMap';
import RouteSegmentEditModal from '../../components/modals/RouteSegmentEditModal';
import { DEFAULT_SETTINGS } from '../../types';
import { Roadmap, Place } from '../../types/roadmap';
import { getRequestUrlCalls, resetRequestUrlMocks } from '../__mocks__/obsidian';

const disabledSettings = { ...DEFAULT_SETTINGS, googleMapsApiKey: 'saved-google-key', gaodeWebServiceKey: 'saved-amap-key' };
const from: Place = { id: 'A', name: 'A', detail: { address: { longitude: 116, latitude: 40 } } };
const to: Place = { id: 'B', name: 'B', detail: { address: { longitude: 117, latitude: 41 } } };
const roadmap: Roadmap = { id: 'R', name: 'R', detail: { map_provider: 'google' }, items: [from, to] };

beforeEach(resetRequestUrlMocks);

test('None suppresses all static map URLs with saved keys and trip overrides', () => {
  const view = render(<>
    <StaticMap roadmap={roadmap} settings={disabledSettings} />
    <PlaceStaticMap settings={disabledSettings} preferredProvider="gaode" placeName="A" mapKey="A"
      places={[{ lng: 116, lat: 40 }]} currentIndex={0} />
  </>);
  expect(view.container.querySelector('img')).toBeNull();
});

test('disabling maps removes an already rendered preview and re-enabling still works', () => {
  const online = { ...disabledSettings, mapApiProvider: 'google' as const };
  const view = render(<StaticMap roadmap={roadmap} settings={online} />);
  expect(view.container.querySelector('img')!.src).toContain('maps.googleapis.com');
  view.rerender(<StaticMap roadmap={roadmap} settings={disabledSettings} />);
  expect(view.container.querySelector('img')).toBeNull();
  view.rerender(<StaticMap roadmap={roadmap} settings={online} />);
  expect(view.container.querySelector('img')!.src).toContain('maps.googleapis.com');
});

test('route editing remains local with None even when a trip selects Google', async () => {
  const onConfirm = jest.fn();
  const view = render(<RouteSegmentEditModal visible settings={disabledSettings}
    from={from} to={to} preferredProvider="google" initial={{ travelMode: 'walk', distance: 123, duration: 5 }}
    onCancel={jest.fn()} onConfirm={onConfirm} />);
  await act(async () => { fireEvent.click(view.getAllByRole('radio')[3]); });
  expect(getRequestUrlCalls()).toEqual([]);
  // Manual edits and save must continue to work without a map service.
  fireEvent.change(view.getAllByRole('spinbutton')[0], { target: { value: '456' } });
  fireEvent.click(view.container.querySelector('.lac-btn-confirm')!);
  expect(onConfirm).toHaveBeenCalledWith({ travelMode: 'drive', distance: 456, duration: 5 });
});
