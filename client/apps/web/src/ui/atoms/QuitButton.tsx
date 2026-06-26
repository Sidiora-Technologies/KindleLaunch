'use client';
import Image from "next/image";
import React from "react";
import quitImg from "@/assets/icons/quit_white.svg";


const QuitButton = () => {
const quitShow = false;
return (
    <>
        {
            quitShow && 
                        <div className="rounded-sm bg-red-middle3 p-1 absolute right-1 top-1 hover:bg-red-600 transition">
                            <Image src={quitImg} alt="quit" />
                        </div>
        }
    </>
  );
};

export default QuitButton;