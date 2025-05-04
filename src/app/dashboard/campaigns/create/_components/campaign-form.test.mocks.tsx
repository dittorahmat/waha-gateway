// @vitest-environment jsdom
import React from 'react';
import * as SelectPrimitive from '@radix-ui/react-select';
import { vi } from 'vitest';

// Mock scrollIntoView for jsdom
window.HTMLElement.prototype.scrollIntoView = vi.fn();

// Mock Radix Select Portal to render children inline for testing
vi.mock('@radix-ui/react-select', async (importOriginal) => {
  const original = await importOriginal<typeof SelectPrimitive>();
  return {
    ...original,
    Portal: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  };
});

// Mock data arrays
export const mockContactLists = [
  { id: 'list-1', name: 'List One', contactCount: 10 },
  { id: 'list-2', name: 'List Two', contactCount: 25 },
];
export const mockTemplates = [
  { id: 'tmpl-1', name: 'Template Alpha' },
  { id: 'tmpl-2', name: 'Template Beta' },
];
export const mockMediaItems = [
  { id: 'media-1', filename: 'image1.png', url: '/uploads/image1.png' },
  { id: 'media-2', filename: 'photo_a.jpg', url: '/uploads/photo_a.jpg' },
];

// Mock mutation functions
export const mockCreateMutate = vi.fn();
export const mockUploadMutate = vi.fn();

// Mock tRPC React module
vi.mock('~/trpc/react', () => ({
  TRPCReactProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  api: {
    useUtils: () => ({
      mediaLibrary: { list: { invalidate: vi.fn(() => Promise.resolve()) } },
    }),
    contactList: { list: { useQuery: vi.fn(() => ({ data: mockContactLists, isLoading: false, isError: false, error: null, status: 'success', fetchStatus: 'idle' })) } },
    template: { list: { useQuery: vi.fn(() => ({ data: mockTemplates, isLoading: false, isError: false, error: null, status: 'success', fetchStatus: 'idle' })) } },
    mediaLibrary: {
      list: { useQuery: vi.fn(() => ({ data: mockMediaItems, isLoading: false, isError: false, error: null, status: 'success', fetchStatus: 'idle' })) },
      upload: { useMutation: vi.fn((opts?: any) => {
        mockUploadMutate.mockClear();
        mockUploadMutate.mockImplementation((data, options) => {
          if (opts?.onSuccess) opts.onSuccess({ id: 'mock-media-id' }, data, undefined);
          return Promise.resolve({ id: 'mock-media-id' });
        });
        return { mutate: mockUploadMutate, mutateAsync: mockUploadMutate, isPending: false, isSuccess: true, isError: false, error: null, data: { id: 'mock-media-id' }, reset: vi.fn(), status: 'success' };
      }) }
    },
    campaign: { create: { useMutation: vi.fn((opts?: any) => {
        mockCreateMutate.mockClear();
        mockCreateMutate.mockImplementation(async (data, options) => {
          const result = { id: 'mock-campaign-id', name: data.name ?? 'Mock Campaign' };
          // Simulate async operation
          await new Promise(resolve => setTimeout(resolve, 0));
          if (opts?.onSuccess) {
            opts.onSuccess(result, data, undefined);
          }
          return result;
        });
        return { mutate: mockCreateMutate, mutateAsync: mockCreateMutate, isPending: false, isSuccess: true, isError: false, error: null, data: { id: 'mock-campaign-id', name: 'Mock Campaign' }, reset: vi.fn(), status: 'success' };
      }) } }
  }
}));

// Mock next/navigation
export const mockPush = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: mockPush }) }));

// Mock sonner toast
import { toast } from 'sonner';
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() } }));

// Mock FileReader
export const mockReadAsDataURL = vi.fn();
export const mockFileReader = vi.fn(function () {
  let _onload: any = null;
  let _onerror: any = null;
  return {
    set onload(fn: any) { _onload = fn; },
    get onload() { return _onload; },
    set onerror(fn: any) { _onerror = fn; },
    get onerror() { return _onerror; },
    result: 'data:image/png;base64,dummycontent',
    readAsDataURL(file: File) {
      setTimeout(() => { this.result = 'data:image/png;base64,dummycontent'; if (_onload) _onload(); }, 0);
    }
  };
});
vi.stubGlobal('FileReader', mockFileReader);

// Mock datetime picker
vi.mock('react-datetime-picker', () => ({
  __esModule: true,
  default: (props: any) => {
    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const d = e.target.value ? new Date(e.target.value) : null;
      props.onChange(d);
    };
    return (
      <input
        type="datetime-local"
        data-testid={props['data-testid'] || 'scheduledAt'}
        name={props.name}
        value={props.value instanceof Date ? props.value.toISOString().slice(0, 16) : props.value || ''}
        onChange={handleChange}
        min={props.minDate instanceof Date ? props.minDate.toISOString().slice(0, 16) : props.minDate}
        {...(props.register ? props.register('scheduledAt') : {})}
      />
    );
  }
}));
