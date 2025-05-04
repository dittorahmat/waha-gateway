import React from 'react';
import { render } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import CampaignForm from './campaign-form';
import { TRPCReactProvider } from '~/trpc/react';

export function renderComponent() {
  const queryClient = new QueryClient();
  const formInstanceRef = React.createRef<any>();
  const element = React.createElement(
    QueryClientProvider,
    { client: queryClient },
    React.createElement(
      TRPCReactProvider,
      null,
      React.createElement(CampaignForm as any, { formInstanceRef } as any)
    )
  );
  const renderResult = render(element);
  return { ...renderResult, formInstanceRef };
}
