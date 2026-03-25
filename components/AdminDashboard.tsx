import React, { useState, useEffect } from 'react';
import { authService } from '../services/authService';

export const AdminDashboard: React.FC = () => {
    const [users, setUsers] = useState<any[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState('');

    useEffect(() => {
        const fetchUsers = async () => {
            try {
                const data = await authService.getUsersList();
                setUsers(data.users || []);
            } catch (err: any) {
                setError(err.message || 'Failed to fetch users');
            } finally {
                setIsLoading(false);
            }
        };

        fetchUsers();
    }, []);

    if (isLoading) {
        return (
            <div className="flex-1 flex items-center justify-center p-8 bg-[#0d1117] h-full">
                <div className="w-8 h-8 border-4 border-purple-500 border-t-transparent rounded-full animate-spin"></div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="flex-1 p-8 bg-[#0d1117] h-full text-center">
                <div className="inline-flex items-center gap-2 px-4 py-3 bg-red-500/10 border border-red-500/20 text-red-500 rounded-lg">
                    <span className="material-symbols-rounded">error</span>
                    <span>{error}</span>
                </div>
            </div>
        );
    }

    return (
        <div className="flex-1 overflow-y-auto bg-[#0d1117] p-8 h-full">
            <div className="max-w-4xl mx-auto">
                <div className="flex items-center gap-3 mb-8">
                    <span className="material-symbols-rounded text-purple-500 text-3xl">admin_panel_settings</span>
                    <h2 className="text-2xl font-bold text-white tracking-tight">Admin Dashboard</h2>
                </div>

                <div className="bg-[#161b22] border border-[#30363d] rounded-xl overflow-hidden shadow-xl">
                    <div className="px-6 py-4 border-b border-[#30363d] bg-[#1c2128]">
                        <h3 className="text-sm font-semibold text-gray-300">Registered Users ({users.length})</h3>
                    </div>

                    <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="border-b border-[#30363d] text-xs uppercase text-gray-500 bg-[#0d1117]/50">
                                    <th className="px-6 py-4 font-semibold">Name</th>
                                    <th className="px-6 py-4 font-semibold">Email</th>
                                    <th className="px-6 py-4 font-semibold">Role</th>
                                    <th className="px-6 py-4 font-semibold">Joined</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-[#30363d]">
                                {users.map((u) => (
                                    <tr key={u._id} className="hover:bg-[#1c2128]/50 transition-colors">
                                        <td className="px-6 py-4 text-sm font-medium text-gray-200">
                                            {u.name}
                                        </td>
                                        <td className="px-6 py-4 text-sm text-gray-400">
                                            {u.email}
                                        </td>
                                        <td className="px-6 py-4">
                                            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${u.role === 'admin' ? 'bg-purple-500/10 text-purple-400 border-purple-500/20' : 'bg-gray-500/10 text-gray-400 border-gray-500/20'}`}>
                                                {u.role}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 text-sm text-gray-500">
                                            {new Date(u.createdAt).toLocaleDateString()}
                                        </td>
                                    </tr>
                                ))}
                                {users.length === 0 && (
                                    <tr>
                                        <td colSpan={4} className="px-6 py-8 text-center text-sm text-gray-500">
                                            No users found.
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>
    );
};
