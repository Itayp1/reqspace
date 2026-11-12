import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import ConfirmModal from '../components/common/ConfirmModal';

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
