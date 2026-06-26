'use client';
import ConversationList from '@/widgets/chat/conversation-list';
export default function ChatModule() {
  return (
    <div className="p-6 text-white max-w-2xl mx-auto">
      <h1 className="text-size-18 font-manrope-extra-bold mb-6">Messages</h1>
      <ConversationList />
    </div>
  );
}
