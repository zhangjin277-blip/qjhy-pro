"use client";
// src/components/Pagination.jsx
// Version: 2.0.0 (Smart Ellipsis Pagination)
import React, { useState, useEffect } from 'react';
import { ChevronLeft, ChevronRight, MoreHorizontal } from 'lucide-react';

export default function Pagination({ currentPage, totalCount, pageSize, onPageChange, onPageSizeChange }) {
    const totalPages = Math.ceil(totalCount / pageSize);
    const [jumpPage, setJumpPage] = useState('');

    // --- 核心算法：生成页码数组 ---
    const getPageNumbers = () => {
        const delta = 2; // 当前页前后保留几个页码
        const range = [];
        const rangeWithDots = [];
        let l;

        // 1. 生成原始列表 (包含 1, total, 和 current 附近的页码)
        for (let i = 1; i <= totalPages; i++) {
            if (i === 1 || i === totalPages || (i >= currentPage - delta && i <= currentPage + delta)) {
                range.push(i);
            }
        }

        // 2. 插入省略号
        for (let i of range) {
            if (l) {
                if (i - l === 2) {
                    rangeWithDots.push(l + 1); // 如果中间只缺一个，直接补上，不用省略号
                } else if (i - l !== 1) {
                    rangeWithDots.push('...');
                }
            }
            rangeWithDots.push(i);
            l = i;
        }

        return rangeWithDots;
    };

    const handleJump = (e) => {
        if (e.key === 'Enter') {
            let p = parseInt(jumpPage);
            if (!isNaN(p)) {
                if (p < 1) p = 1;
                if (p > totalPages) p = totalPages;
                onPageChange(p);
                setJumpPage(''); // 清空输入框
            }
        }
    };

    if (totalCount === 0) return null;

    return (
        <div className="flex flex-wrap justify-between items-center px-2 py-3 border-t border-slate-100 mt-auto select-none gap-2">
            {/* 左侧：统计信息 */}
            <div className="text-[11px] text-slate-400 font-medium">
                共 <span className="text-slate-600 font-bold">{totalCount}</span> 条记录
                {totalPages > 1 && <>
                    <span className="mx-2">|</span>
                    共 <span className="text-slate-600 font-bold">{totalPages}</span> 页
                </>}
            </div>

            {/* 右侧：分页控制器（仅多页时显示） */}
            {totalPages > 1 && <div className="flex items-center gap-1.5">
                {/* 1. 每页条数选择器 */}
                {onPageSizeChange && (
                    <select
                        className="h-7 border border-slate-200 rounded-lg px-1.5 text-[11px] text-slate-600 outline-none bg-white hover:border-blue-400 focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition-all mr-2 cursor-pointer"
                        value={pageSize} 
                        onChange={e => {
                            onPageSizeChange(Number(e.target.value));
                            onPageChange(1);
                        }}
                    >
                        <option value={20}>20 条/页</option>
                        <option value={50}>50 条/页</option>
                        <option value={100}>100 条/页</option>
                    </select>
                )}

                {/* 2. 上一页按钮 */}
                <button 
                    disabled={currentPage === 1} 
                    onClick={() => onPageChange(currentPage - 1)} 
                    className="w-7 h-7 flex items-center justify-center border border-slate-200 rounded-lg hover:bg-slate-50 hover:border-blue-400 disabled:opacity-30 disabled:cursor-not-allowed transition-all text-slate-500"
                    title="上一页"
                >
                    <ChevronLeft className="w-3.5 h-3.5" />
                </button>

                {/* 3. 智能页码列表 */}
                <div className="flex items-center gap-1">
                    {getPageNumbers().map((page, idx) => (
                        page === '...' ? (
                            <span key={`dots-${idx}`} className="w-7 h-7 flex items-center justify-center text-slate-400">
                                <MoreHorizontal className="w-3 h-3" />
                            </span>
                        ) : (
                            <button
                                key={page}
                                onClick={() => onPageChange(page)}
                                className={`w-7 h-7 flex items-center justify-center rounded-lg text-[11px] font-bold transition-all border ${
                                    currentPage === page
                                        ? 'bg-gradient-to-r from-blue-500 to-blue-600 text-white border-blue-500 shadow-sm shadow-blue-200'
                                        : 'bg-white text-slate-600 border-slate-200 hover:border-blue-400 hover:text-blue-600'
                                }`}
                            >
                                {page}
                            </button>
                        )
                    ))}
                </div>

                {/* 4. 下一页按钮 */}
                <button 
                    disabled={currentPage === totalPages} 
                    onClick={() => onPageChange(currentPage + 1)} 
                    className="w-7 h-7 flex items-center justify-center border border-slate-200 rounded-lg hover:bg-slate-50 hover:border-blue-400 disabled:opacity-30 disabled:cursor-not-allowed transition-all text-slate-500"
                    title="下一页"
                >
                    <ChevronRight className="w-3.5 h-3.5" />
                </button>

                {/* 5. 快速跳转输入框 */}
                <div className="flex items-center gap-1 ml-2 pl-2 border-l border-slate-200">
                    <span className="text-[10px] text-slate-400">跳至</span>
                    <input 
                        type="number" 
                        className="w-10 h-7 border border-slate-200 rounded-lg text-center text-[11px] outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition-all [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                        value={jumpPage}
                        onChange={(e) => setJumpPage(e.target.value)}
                        onKeyDown={handleJump}
                        placeholder={currentPage}
                    />
                    <span className="text-[10px] text-slate-400">页</span>
                </div>
            </div>}
        </div>
    );
}