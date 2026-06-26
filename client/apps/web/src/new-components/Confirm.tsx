"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Fingerprint, Plus } from "lucide-react";
import React, { useState } from "react";

const Skiper45 = () => {
  return (
    <div className="flex h-full w-screen items-end justify-center p-5">
      <div className="absolute left-1/2 top-12 grid -translate-x-1/2 content-start justify-items-center gap-6 text-center">
        <span className="after:from-background after:to-foreground relative max-w-[12ch] text-xs uppercase leading-tight opacity-40 after:absolute after:left-1/2 after:top-full after:h-16 after:w-px after:bg-gradient-to-b after:content-['']">
          Toggle layout with animation
        </span>
      </div>
      <FamilyConfirm />
    </div>
  );
};

export { Skiper45 };

const FamilyConfirm = () => {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <AnimatePresence>
        {isOpen && (
          <motion.div
            onClick={() => setIsOpen((x) => !x)}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="bg-muted/10 backdrop-blur-xs fixed inset-0 z-10 h-full w-full"
          />
        )}
      </AnimatePresence>
      <motion.div
        layout
        style={{
          transformOrigin: "50% 50% 0px",
          borderRadius: "30px",
        }}
        className="font-open-runde relative z-20 w-full max-w-[430px] overflow-hidden"
      >
        <motion.div
          style={{
            pointerEvents: !isOpen ? "all" : "none",
          }}
          className="relative z-10 flex w-full items-center justify-center"
        >
          <motion.button
            onClick={() => setIsOpen((x) => !x)}
            whileTap={{
              scale: 0.9,
            }}
            transition={LOGO_SPRING}
            layoutId="receive"
            className="h-10 w-full max-w-[300px] transform-none rounded-full bg-sky-500 text-white"
          >
            <motion.span>Receive</motion.span>
          </motion.button>
        </motion.div>

        <AnimatePresence mode="popLayout">
          {isOpen && (
            <motion.div
              layout
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{
                type: "spring",
                stiffness: 550 / SPEED,
                damping: 45,
                mass: 0.7,
              }}
              style={{
                transformOrigin: "50% 50% 0px",
              }}
              className="bg-background relative flex flex-col justify-end rounded-3xl p-4"
            >
              {/* top bar */}

              <div className="flex w-full items-center justify-between">
                <div className="flex items-center justify-center gap-2 text-xl font-medium">
                  <div className="flex size-10 items-center justify-center rounded-full bg-sky-500/10">
                    <Fingerprint className="size-6 text-sky-500" />
                  </div>
                  Confirm
                </div>
                <span
                  className="cursor-pointer"
                  onClick={() => setIsOpen((x) => !x)}
                >
                  <Plus className="size-6 rotate-45 text-sky-500" />
                </span>
              </div>

              <p className="w-65 text-foreground/50 my-5">
                Are you sure you want to receive hell load of money?
              </p>

              <div className="flex items-center justify-end gap-2">
                <button
                  onClick={() => setIsOpen((x) => !x)}
                  className="bg-muted h-10 w-full rounded-full"
                >
                  Cancel
                </button>

                <motion.button
                  onClick={() => setIsOpen((x) => !x)}
                  whileTap={{
                    scale: 0.9,
                  }}
                  transition={LOGO_SPRING}
                  layoutId="receive"
                  className="h-10 w-full max-w-[300px] transform-none rounded-full bg-sky-500 text-white"
                >
                  <motion.span>Receive</motion.span>
                </motion.button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </>
  );
};

const SPEED = 1;

const LOGO_SPRING = {
  type: "spring",
  stiffness: 350 / SPEED,
  damping: 35,
} as const;

/**
 * Skiper 45 Family Confirm — React + framer motion
 * Inspired by and adapted from https://family.co/
 * Inspired by and adapted from https://motion.dev/
 * We respect the original creators. This is an inspired rebuild with our own taste and does not claim any ownership.
 * These animations aren’t associated with the family.co . They’re independent recreations meant to study interaction design
 * These animations aren’t associated with the motion.dev+ . They’re independent recreations meant to study interaction design
 *
 * License & Usage:
 * - Free to use and modify in both personal and commercial projects.
 * - Attribution to Skiper UI is required when using the free version.
 * - No attribution required with Skiper UI Pro.
 *
 * Feedback and contributions are welcome.
 *
 * Author: @gurvinder-singh02
 * Website: https://gxuri.in
 * Twitter: https://x.com/Gur__vi
 */
