import { useEffect, useState } from 'react';
import { pushSubscribed, subscribePush, unsubscribePush } from '../lib/push-client';
import { Icon } from './icons';

export function PushToggle({ onStatus }: { onStatus?: (message: string) => void }) {
  const [on, setOn] = useState(false);

  useEffect(() => {
    let cancel = false;
    void pushSubscribed()
      .then((subscribed) => {
        if (!cancel) setOn(subscribed);
      })
      .catch(() => undefined);
    return () => {
      cancel = true;
    };
  }, []);

  async function toggle() {
    try {
      if (on) {
        await unsubscribePush();
        setOn(false);
        return;
      }
      const result = await subscribePush();
      setOn(result === 'ok');
      if (result !== 'ok') onStatus?.('Sin avisos');
    } catch {
      onStatus?.('Sin avisos');
    }
  }

  return (
    <button type="button" className={on ? 'icon-button on' : 'icon-button'} aria-pressed={on} aria-label="Avisos" title="Avisos" onClick={() => void toggle()}>
      <Icon name="bell" />
    </button>
  );
}
