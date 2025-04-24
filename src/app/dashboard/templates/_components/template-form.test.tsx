import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TemplateForm } from './template-form'; // Assuming named export, adjust if needed

// TODO: Implement tests for TemplateForm component

// Mock necessary hooks or context (e.g., trpc, react-hook-form)
// vi.mock('@/trpc/react', () => ({
//   api: {
//     template: {
//       createTemplate: { useMutation: vi.fn() },
//       updateTemplate: { useMutation: vi.fn() },
//       // Mock other procedures if needed
//     },
//   },
// }));
// Mock react-hook-form if necessary

describe('TemplateForm Component', () => {
  // Define mocks at the describe scope
  const mockOnSubmit = vi.fn().mockResolvedValue(undefined);
  const mockOnCancel = vi.fn();

  // Reset mocks before each test
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should render correct elements and empty fields in create mode', async () => {
    const user = userEvent.setup();
    render(
      <TemplateForm
        onSubmit={mockOnSubmit}
        isSubmitting={false}
        submitButtonText="Create Template"
        onCancel={mockOnCancel}
      />
    );

    // Check labels and inputs
    expect(screen.getByLabelText(/Template Name/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Template Name/i)).toHaveValue('');
    expect(screen.getByLabelText(/Message Content/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Message Content/i)).toHaveValue('');

    // Check buttons
    expect(screen.getByRole('button', { name: /Create Template/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Cancel/i })).toBeInTheDocument();
  });

  it('should render correct elements and pre-filled fields in edit mode', async () => {
    const user = userEvent.setup();
    const initialData = {
      id: 'tmpl_1',
      userId: 'user_123',
      name: 'Test Template Edit',
      textContent: 'Test Body Content Edit',
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    render(
      <TemplateForm
        initialData={initialData}
        onSubmit={mockOnSubmit}
        isSubmitting={false}
        submitButtonText="Update Template"
        onCancel={mockOnCancel}
      />
    );

    // Check labels and pre-filled inputs
    expect(screen.getByLabelText(/Template Name/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Template Name/i)).toHaveValue(initialData.name);
    expect(screen.getByLabelText(/Message Content/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Message Content/i)).toHaveValue(initialData.textContent);

    // Check buttons
    expect(screen.getByRole('button', { name: /Update Template/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Cancel/i })).toBeInTheDocument();
  });

  it('should call onSubmit with form values when submitted', async () => {
    const user = userEvent.setup();
    render(
      <TemplateForm
        onSubmit={mockOnSubmit}
        isSubmitting={false}
        submitButtonText="Save"
        onCancel={mockOnCancel}
      />
    );

    const nameInput = screen.getByLabelText(/Template Name/i);
    const contentInput = screen.getByLabelText(/Message Content/i);
    const submitButton = screen.getByRole('button', { name: /Save/i });

    const testName = 'My New Template';
    const testContent = 'Hello {Name}!';

    await user.type(nameInput, testName);
    await user.type(contentInput, testContent);
    await user.click(submitButton);

    expect(mockOnSubmit).toHaveBeenCalledTimes(1);
    expect(mockOnSubmit).toHaveBeenCalledWith({
      name: testName,
      textContent: testContent,
    });
  });

  it('should call onCancel when cancel button is clicked', async () => {
     const user = userEvent.setup();
     render(
       <TemplateForm
         onSubmit={mockOnSubmit}
         isSubmitting={false}
         onCancel={mockOnCancel}
       />
     );

     const cancelButton = screen.getByRole('button', { name: /Cancel/i });
     await user.click(cancelButton);

     expect(mockOnCancel).toHaveBeenCalledTimes(1);
     expect(mockOnSubmit).not.toHaveBeenCalled();
   });


  // TODO: Add tests for form submission (success and error cases) -> Covered basic submit call
  // Add tests for input validation
  // Add tests for loading/pending states during submission
  // Add tests for handling initialData in edit mode
});