import { useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { formatInviteCode } from '@roomi/shared';

export function InviteCodeCard({ inviteCode }: { inviteCode: string }) {
  const [copied, setCopied] = useState(false);

  const copyCode = async () => {
    if (window.roomi?.clipboard) {
      window.roomi.clipboard.writeText(inviteCode);
    } else {
      await navigator.clipboard.writeText(inviteCode);
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1_500);
  };

  return (
    <section className="invite-card" aria-label="초대 코드">
      <span className="invite-card__label">초대 코드</span>
      <strong className="invite-card__code">{formatInviteCode(inviteCode)}</strong>
      <button type="button" className="btn btn--soft invite-card__copy" onClick={() => void copyCode()}>
        {copied ? <Check size={16} /> : <Copy size={16} />}
        {copied ? '복사됨' : '코드 복사'}
      </button>
    </section>
  );
}
