import React from 'react';
import { createRoot } from 'react-dom/client';
import type { Root } from 'react-dom/client';
import ConfirmModal from '../components/common/ConfirmModal';
import { PromptModal } from '../components/common/PromptModal';

function mountDialog(render: (close: () => void) => React.ReactNode) {
  const div = document.createElement('div');
  document.body.appendChild(div);
  const root: Root = createRoot(div);

  return new Promise<void>((resolve) => {
    const close = () => {
      root.unmount();
      if (div.parentNode) {
        div.parentNode.removeChild(div);
      }
      resolve();
    };

    root.render(render(close));
  });
}

export async function customConfirm(title: string, message: string, confirmLabel: string = 'Confirm'): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    let result = false;
    mountDialog((close) => (
      <ConfirmModal
        title={title}
        message={message}
        confirmLabel={confirmLabel}
        onConfirm={() => {
          result = true;
          close();
        }}
        onCancel={() => {
          result = false;
          close();
        }}
      />
    )).then(() => {
      resolve(result);
    });
  });
}

export async function customPrompt(title: string, initialValue: string = '', placeholder: string = 'Enter value...', submitText: string = 'Save'): Promise<string | null> {
  return new Promise<string | null>((resolve) => {
    let result: string | null = null;
    mountDialog((close) => (
      <PromptModal
        title={title}
        initialValue={initialValue}
        placeholder={placeholder}
        submitText={submitText}
        onSubmit={(value) => {
          result = value;
          close();
        }}
        onCancel={() => {
          result = null;
          close();
        }}
      />
    )).then(() => {
      resolve(result);
    });
  });
}
