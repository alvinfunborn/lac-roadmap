import React from 'react';
import { act, fireEvent, render, waitFor } from '@testing-library/react';
import MapSelector from '../../../components/map/MapSelector';
import AggregatedMap from '../../../components/map/AggregatedMap';
import { DEFAULT_SETTINGS } from '../../../types';

const instances: any[] = [];
let pendingInit: (() => Promise<void>) | undefined;
jest.mock('../../../components/map/providers/MapProviderFactory', () => ({
  MapProviderFactory: { createProvider: jest.fn(() => {
    const inst = { initMap: jest.fn(() => pendingInit ? pendingInit() : Promise.resolve()),
      destroy: jest.fn(), clearMarkers: jest.fn(), clearPolylines: jest.fn(),
      displaySearchMarkers: jest.fn(() => []), fitBounds: jest.fn(), onMapClick: jest.fn() };
    instances.push(inst);
    return inst;
  }) }
}));
const settings = { ...DEFAULT_SETTINGS, mapApiProvider: 'google' as const, googleMapsApiKey: 'test', gaodeJsApiKey: 'test' };
const locations = [
  { longitude: 111, latitude: 40, name: 'Done', status: 'done' as const },
  { longitude: 112, latitude: 41, name: 'Plan', status: 'plan' as const },
  { longitude: 113, latitude: 42, name: 'Wish', status: 'wish' as const },
];
const props = { visible: true, settings, readOnly: true, routeMarkerStyle: 'circle' as const,
  routeLocations: locations, onCancel: jest.fn(), onConfirm: jest.fn() };
beforeEach(() => { instances.length = 0; pendingInit = undefined; });

test('overview and enlarged viewer preserve all three statuses', async () => {
  const view = render(<MapSelector {...props} />);
  await waitFor(() => expect(instances[0].displaySearchMarkers).toHaveBeenCalled());
  expect(instances[0].displaySearchMarkers.mock.calls[0][2].statuses).toEqual(['done', 'plan', 'wish']);
  expect(view.getByLabelText('地图地点状态')).toBeTruthy();
  view.unmount();
  render(<AggregatedMap app={{} as any} repository={{} as any} settings={settings}
    overrideLocations={locations.map(l => ({ lng: l.longitude, lat: l.latitude, title: l.name, status: l.status }))} />);
  await waitFor(() => expect(instances[1].displaySearchMarkers).toHaveBeenCalled());
  expect(instances[1].displaySearchMarkers.mock.calls[0][2].statuses).toEqual(['done', 'plan', 'wish']);
});

test('equivalent initial coordinates do not rebuild the map or reset its viewport', async () => {
  const view = render(<MapSelector {...props} initialLocation={{ ...locations[0] }} />);
  await waitFor(() => expect(instances[0].displaySearchMarkers).toHaveBeenCalled());
  view.rerender(<MapSelector {...props} initialLocation={{ ...locations[0] }} />);
  expect(instances).toHaveLength(1);
  expect(instances[0].displaySearchMarkers).toHaveBeenCalledTimes(1);
});

test('switching the visible viewer does not initialize hidden viewers', async () => {
  render(<><MapSelector {...props} /><MapSelector {...props} visible={false} /></>);
  await waitFor(() => expect(instances[0].fitBounds).toHaveBeenCalled());
  fireEvent.click(document.querySelector('.lac-map-provider-trigger')!);
  fireEvent.click(document.querySelectorAll('[role="menuitem"]')[1]);
  await waitFor(() => expect(instances[1].fitBounds).toHaveBeenCalled());
  expect(instances).toHaveLength(2);
  expect(instances[0].destroy).toHaveBeenCalled();
});

test('closing during SDK load prevents late rendering and releases the old instance', async () => {
  let resolve!: () => void;
  pendingInit = () => new Promise<void>(r => { resolve = r; });
  const view = render(<MapSelector {...props} />);
  view.rerender(<MapSelector {...props} visible={false} />);
  await act(async () => { resolve(); });
  expect(instances[0].destroy).toHaveBeenCalled();
  expect(instances[0].displaySearchMarkers).not.toHaveBeenCalled();
});
