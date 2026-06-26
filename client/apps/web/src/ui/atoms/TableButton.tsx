import React from "react";

const TableButton = ({
    content,
}: { content?: string }) => {
  return (
    <button className="min-w-15 rounded-sm px-3 py-1 hover:bg-gray-800 focus:text-white focus:border-1 focus:border-pink-middle focus:-my-px transition" >{content}</button>
  );
};

export default TableButton;