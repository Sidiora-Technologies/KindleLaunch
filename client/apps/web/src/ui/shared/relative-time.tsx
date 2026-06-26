interface RelativeTimeProps {
  timestamp: number;
  className?: string;
}

export default function RelativeTime({ timestamp, className = '' }: RelativeTimeProps) {
  const now = Date.now() / 1000;
  const diff = now - timestamp;

  let text: string;
  if (diff < 60) text = `${Math.floor(diff)}s ago`;
  else if (diff < 3600) text = `${Math.floor(diff / 60)}m ago`;
  else if (diff < 86400) text = `${Math.floor(diff / 3600)}h ago`;
  else text = `${Math.floor(diff / 86400)}d ago`;

  return <span className={`text-dark-disabled ${className}`}>{text}</span>;
}
