'use client';

import Image from "next/image";

import ascImg from "@/assets/icons/ascdsc.svg";
import arrowLeftRightImg from "@/assets/icons/ArrowsLeftRight.svg";
import dollarImg from "@/assets/icons/dollar-minimalistic_svgrepo.com.svg";
import filterImg from "@/assets/icons/filter.svg";
import TableRowComponent from "./TableRowComponent";
import { useTerminalStore } from "@/utils/stores/terminalStore";


const Table = () => {
    const transactions = useTerminalStore((s) => s.transactions);
    const txLoading = useTerminalStore((s) => s.txLoading);

    // Find max amountIn for progress bar scaling
    const maxAmount = transactions.length > 0
        ? Math.max(...transactions.map((tx) => parseFloat(tx.amountIn) || 0))
        : 1;

    return (
        <div className="flex flex-col">
            <div className="overflow-auto">
                <div className="min-w-full inline-block align-middle">
                    <div className="overflow-auto">
                        <table className="min-w-full divide-y-2 divide-dark-gray text-size-11 font-manrope-bold text-dark-disabled w-full text-left">
                            <thead className="bg-dark-gray5">
                                <tr>
                                    <th scope="col" className="px-3 py-2">
                                        <div className="flex items-center gap-1">
                                            <span>Age</span>
                                            <Image src={ascImg} alt="ascending" className="min-w-4" />
                                        </div>
                                    </th>
                                    <th scope="col" className="px-3 py-2">Side</th>
                                    <th scope="col" className="px-3 py-2">Price</th>
                                    <th scope="col" className="px-3 py-2">MCap</th>
                                    <th scope="col" className="px-3 py-2">Amount</th>
                                    <th scope="col" className="px-3 py-2">Total USD</th>
                                    <th scope="col" className="px-3 py-2">
                                        <div className="flex justify-end items-center gap-1">
                                            <span>Maker</span>
                                            <Image src={filterImg} alt="filter" className="min-w-3" />
                                        </div>
                                    </th>
                                </tr>
                            </thead>
                            <tbody className="divide-y-2 divide-dark-gray">
                                {txLoading && transactions.length === 0 && (
                                    <tr><td colSpan={7} className="px-3 py-6 text-center text-dark-disabled animate-pulse">Loading transactions...</td></tr>
                                )}
                                {!txLoading && transactions.length === 0 && (
                                    <tr><td colSpan={7} className="px-3 py-6 text-center text-dark-disabled">No transactions yet</td></tr>
                                )}
                                {transactions.map((tx) => {
                                    const progress = maxAmount > 0 ? Math.round((parseFloat(tx.amountIn) / maxAmount) * 30) : 5;
                                    return (
                                        <TableRowComponent
                                            key={tx.id}
                                            isBuy={tx.isBuy}
                                            progress={String(Math.max(progress, 2))}
                                            price={tx.price}
                                            amountIn={tx.amountIn}
                                            amountOut={tx.amountOut}
                                            sender={tx.sender}
                                            blockTimestamp={tx.blockTimestamp}
                                            txHash={tx.txHash}
                                        />
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>
    );
  };
  
  export default Table;