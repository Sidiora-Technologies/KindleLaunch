"use client";

import NumberFlow from "@number-flow/react";
import { AnimatePresence, motion, MotionConfig } from "framer-motion";
import { ArrowDownUp, ChevronDown, Equal } from "lucide-react";
import React, { useRef, useState } from "react";
import useMeasure from "react-use-measure";

import { cn } from "@/lib/utils";

const Skiper22 = () => {
  const [value, setValue] = useState(0);
  const [inputValue, setInputValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const [ref, bounds] = useMeasure();
  const [ref2, bounds2] = useMeasure();

  // Constants
  const ETH_BALANCE = 111.82;
  const ETH_PRICE = 3445.86; // USD price per ETH
  const AAVE_RATE = 10.87; // AAVE per ETH exchange rate

  // Calculate USD value
  const usdValue = value * ETH_PRICE;

  // Calculate AAVE receive amount
  const aaveReceive = value * AAVE_RATE;

  // Check if input exceeds balance
  const isInsufficient = value > ETH_BALANCE;

  // Handle input change
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const inputVal = e.target.value;

    // Only allow numbers, decimal point, and empty string
    if (!/^[0-9]*\.?[0-9]*$/.test(inputVal) && inputVal !== "") {
      return;
    }

    // Handle empty input
    if (inputVal === "" || inputVal === ".") {
      setValue(0);
      setInputValue(inputVal);
      return;
    }

    // Handle decimal numbers starting with .
    if (inputVal.startsWith(".")) {
      setValue(0);
      setInputValue(inputVal);
      return;
    }

    const newValue = parseFloat(inputVal) || 0;
    const maxValue = 11111;

    // Prevent values above max
    if (newValue > maxValue) {
      setValue(maxValue);
      setInputValue(maxValue.toString());
    } else {
      setValue(newValue);
      setInputValue(inputVal);
    }
  };

  // Handle Use Max button
  const handleUseMax = () => {
    setValue(ETH_BALANCE);
    setInputValue(ETH_BALANCE.toString());
  };

  // Handle Clear button
  const handleClear = () => {
    setValue(0);
    setInputValue("");
  };

  // Format display value
  const displayValue = inputValue || "0";
  const digits = displayValue.split("");

  return (
    <MotionConfig transition={{ type: "spring", stiffness: 400, damping: 35 }}>
      <div className="font-open-runde flex h-full w-full items-center justify-center bg-[#131313] text-white">
        <div className="flex flex-col items-center justify-center gap-3">
          <div className="relative flex w-[300px] flex-col items-center justify-center gap-5 rounded-3xl border border-[#303030]/50 bg-[#121212] px-3 py-3 sm:w-[350px]">
            <div className="flex w-full items-center justify-between">
              <div className="flex items-center gap-3">
                <img src="/skiperv1/web3/eth.svg" alt="" />
                <div className="">
                  <h2 className="text-base font-semibold">Ethereum</h2>
                  <p className="text-sm text-[#7b7b7b]"> 111.82 ETH</p>
                </div>
              </div>
              <button
                onClick={handleUseMax}
                className="flex items-center gap-1 rounded-full bg-[#222] px-3 py-1 text-sm font-semibold transition-colors hover:bg-[#333]"
              >
                <motion.span
                  animate={{ width: bounds.width > 0 ? bounds.width : "auto" }}
                >
                  <span ref={ref} className="inline-flex overflow-hidden">
                    <AnimatePresence mode="popLayout">
                      {value > 111 ? (
                        <motion.span
                          key="using"
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          exit={{ opacity: 0 }}
                        >
                          Using{" "}
                        </motion.span>
                      ) : (
                        <motion.span
                          key="use"
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          exit={{ opacity: 0 }}
                        >
                          Use{" "}
                        </motion.span>
                      )}
                    </AnimatePresence>
                  </span>
                </motion.span>
                Max
              </button>
            </div>

            <div className="w-full border-t border-[#303030]/50" />

            <div className="mb-6 flex w-full flex-col items-center justify-center gap-4">
              <div className="relative w-[300px] overflow-hidden text-center">
                <input
                  ref={inputRef}
                  type="text"
                  className={cn(
                    "inset-0 w-full cursor-pointer text-center text-[45px] font-semibold tracking-tight text-transparent caret-white outline-none",
                    inputValue === "" && "caret-transparent",
                  )}
                  placeholder="0"
                  value={inputValue}
                  onChange={handleInputChange}
                />
                <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                  <AnimatePresence initial={false} mode="popLayout">
                    {digits.map((digit, index) => (
                      <motion.span
                        key={`${digit}-${index}`}
                        className="text-[45px] font-semibold tracking-tight"
                        initial={{ y: "100%", opacity: 0 }}
                        animate={{ y: "0%", opacity: 1 }}
                        exit={{ y: "100%", opacity: 0 }}
                      >
                        {digit}
                      </motion.span>
                    ))}
                  </AnimatePresence>
                </div>
              </div>

              <div className="flex w-full items-center justify-center gap-2">
                <AnimatePresence initial={false} mode="popLayout">
                  {!isInsufficient ? (
                    <motion.div
                      key="usd-value"
                      style={{
                        transformOrigin: "top center",
                      }}
                      initial={{ opacity: 0, y: "100%", scale: 0 }}
                      animate={{
                        opacity: 1,
                        scale: 1,
                        y: 0,
                      }}
                      exit={{
                        opacity: 0,
                        scale: 0,
                      }}
                      className="flex items-center justify-center gap-2"
                    >
                      <div className="rounded-full bg-[#222] p-1">
                        <Equal className="size-5" />
                      </div>
                      <motion.div
                        animate={{
                          width: bounds2.width,
                        }}
                        className="flex items-center gap-2 overflow-hidden"
                      >
                        <div
                          ref={ref2}
                          className="font-lg flex justify-between font-semibold tracking-tight"
                        >
                          <span>$</span>
                          {(() => {
                            const charCount: Record<string, number> = {};
                            return usdValue
                              .toLocaleString("en-US", {
                                minimumFractionDigits: 2,
                                maximumFractionDigits: 2,
                              })
                              .split("")
                              .map((char) => {
                                charCount[char] = (charCount[char] || 0) + 1;
                                const isDuplicate = charCount[char] > 1;
                                const key = isDuplicate
                                  ? `usd-${char}-dupChar-${charCount[char]}`
                                  : `usd-${char}`;
                                return (
                                  <motion.span
                                    key={key}
                                    layoutId={key}
                                    className="inline-block"
                                  >
                                    {char}
                                  </motion.span>
                                );
                              });
                          })()}
                        </div>
                      </motion.div>
                      <ArrowDownUp className="size-5" />
                    </motion.div>
                  ) : (
                    <motion.p
                      key="not-enough-eth"
                      initial={{ opacity: 0, scale: 0 }}
                      animate={{
                        opacity: 1,
                        scale: 1,
                        y: 0,
                        x: [0, -5, 5, -3, 3, 0],
                        transition: {
                          x: {
                            delay: 0.2,
                            times: [0, 0.2, 0.4, 0.6, 0.8, 1],
                          },
                          type: "spring",
                          stiffness: 400,
                          damping: 35,
                        },
                      }}
                      exit={{
                        opacity: 0,
                        scale: 0,
                      }}
                      style={{
                        transformOrigin: "bottom center",
                      }}
                      className="font-lg w-max text-center font-semibold tracking-tight text-red-500"
                    >
                      Not Enough ETH
                    </motion.p>
                  )}
                </AnimatePresence>
              </div>
            </div>
            <div className="absolute -bottom-6 rounded-full border border-[#303030]/50 bg-[#121212] p-1.5">
              <ChevronDown className="size-5 opacity-50" />
            </div>
          </div>

          <div className="flex w-[300px] flex-col items-start justify-start gap-5 rounded-3xl border border-[#303030]/50 bg-[#121212] px-3 py-3 sm:w-[350px]">
            <div className="flex w-full items-center justify-between">
              <div className="flex items-center gap-3">
                <img src="/skiperv1/web3/aave.svg" alt="" className="size-10" />
                <div className="">
                  <h2 className="text-base font-semibold">Aave</h2>
                  <p className="text-sm text-[#7b7b7b]"> Receive AAVE</p>
                </div>
              </div>
              <p className="rounded-full pr-2 text-lg font-semibold">
                <NumberFlow value={aaveReceive} />
              </p>
            </div>
          </div>
          <button
            onClick={handleClear}
            className="w-full rounded-full bg-[#222] py-2 text-white/60 transition-colors hover:bg-[#333]"
          >
            Clear
          </button>
        </div>
      </div>
    </MotionConfig>
  );
};

export { Skiper22 };

/**
 * Skiper 22 MicroInteractions_003 — React + framer motion + NumberFlow
 * Orignal concept from family app.
 * Inspired by and adapted from https://jakub.kr
 * We respect the original creators. This is an inspired rebuild with our own taste and does not claim any ownership.
 * These animations aren’t associated with the family.co . They’re independent recreations meant to study interaction design
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
