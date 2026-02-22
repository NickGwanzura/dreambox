import React, { useState } from 'react';
import { Task } from '../types';
import { getTasks, addTask, updateTask, deleteTask, getUsers, getBillboards, updateBillboard } from '../services/mockData';
import { CheckSquare, Plus, Trash2, Calendar, User, Clock, X, Save } from 'lucide-react';

const MinimalInput = ({ label, value, onChange, type = "text", required = false }: any) => (
  <div className="group relative">
    <input type={type} required={required} value={value} onChange={onChange} placeholder=" " className="peer w-full px-0 py-2.5 border-b border-slate-200 bg-transparent text-slate-800 focus:border-slate-800 focus:ring-0 outline-none transition-all font-medium placeholder-transparent" />
    <label className="absolute left-0 -top-2.5 text-xs text-slate-400 font-medium transition-all peer-placeholder-shown:text-sm peer-placeholder-shown:text-slate-400 peer-placeholder-shown:top-2.5 peer-focus:-top-2.5 peer-focus:text-xs peer-focus:text-slate-800 uppercase tracking-wide">{label}</label>
  </div>
);

const MinimalSelect = ({ label, value, onChange, options }: any) => (
  <div className="group relative">
    <select value={value} onChange={onChange} className="peer w-full px-0 py-2.5 border-b border-slate-200 bg-transparent text-slate-800 focus:border-slate-800 focus:ring-0 outline-none transition-all font-medium appearance-none cursor-pointer">
      {options.map((opt: any) => (<option key={opt.value} value={opt.value}>{opt.label}</option>))}
    </select>
    <label className="absolute left-0 -top-2.5 text-xs text-slate-400 font-medium uppercase tracking-wide">{label}</label>
  </div>
);

export const Tasks: React.FC = () => {
  const [tasks, setTasks] = useState<Task[]>(getTasks());
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [taskToDelete, setTaskToDelete] = useState<Task | null>(null);
  
  const [newTask, setNewTask] = useState<Partial<Task>>({
    title: '', description: '', assignedTo: 'Unassigned', priority: 'Medium', status: 'Todo', dueDate: new Date().toISOString().split('T')[0]
  });

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    const task: Task = {
        id: `T-${Date.now()}`,
        title: newTask.title || 'New Task',
        description: newTask.description || '',
        assignedTo: newTask.assignedTo || 'Unassigned',
        priority: (newTask.priority as any) || 'Medium',
        status: 'Todo',
        dueDate: newTask.dueDate || new Date().toISOString().split('T')[0],
        createdAt: new Date().toISOString()
    };
    addTask(task);
    setTasks(getTasks());
    setIsModalOpen(false);
    setNewTask({ title: '', description: '', assignedTo: 'Unassigned', priority: 'Medium', status: 'Todo', dueDate: new Date().toISOString().split('T')[0] });
  };

  const handleStatusChange = (task: Task, newStatus: 'Todo' | 'In Progress' | 'Done') => {
      // Logic for Maintenance Tasks
      if (newStatus === 'Done' && task.relatedBillboardId) {
          const billboard = getBillboards().find(b => b.id === task.relatedBillboardId);
          if (billboard) {
              const today = new Date().toISOString().split('T')[0];
              updateBillboard({ ...billboard, lastMaintenanceDate: today });
              alert(`Maintenance recorded for ${billboard.name}. Next check due in 3 months.`);
          }
      }

      updateTask({ ...task, status: newStatus });
      setTasks(getTasks());
  };

  const handleConfirmDelete = () => {
      if (taskToDelete) {
          deleteTask(taskToDelete.id);
          setTasks(getTasks());
          setTaskToDelete(null);
      }
  };

  const getPriorityColor = (p: string) => {
      switch(p) {
          case 'High': return 'text-red-600 bg-red-50 border-red-100';
          case 'Medium': return 'text-amber-600 bg-amber-50 border-amber-100';
          default: return 'text-slate-600 bg-slate-50 border-slate-100';
      }
  };

  return (
    <>
      <div className="space-y-8 animate-fade-in">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h2 className="text-4xl font-extrabold tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-slate-900 to-slate-600 mb-2">Tasks & Maintenance</h2>
            <p className="text-slate-500 font-medium">Track operational activities and staff assignments</p>
          </div>
          <button onClick={() => setIsModalOpen(true)} className="bg-slate-900 text-white px-5 py-3 rounded-full text-sm font-bold uppercase tracking-wider hover:bg-slate-800 shadow-lg hover:shadow-xl transition-all hover:scale-105 flex items-center gap-2">
            <Plus size={18} /> New Task
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {tasks.map(task => (
                <div key={task.id} className={`bg-white rounded-2xl p-6 border border-slate-100 shadow-sm hover:shadow-md transition-all group flex flex-col justify-between h-full ${task.status === 'Done' ? 'opacity-75' : ''}`}>
                    <div>
                        <div className="flex justify-between items-start mb-4">
                            <div className={`px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider border ${getPriorityColor(task.priority)}`}>
                                {task.priority} Priority
                            </div>
                            <div className="flex gap-2">
                                <select 
                                    value={task.status} 
                                    onChange={(e) => handleStatusChange(task, e.target.value as any)}
                                    className="bg-slate-50 border border-slate-200 text-xs font-bold text-slate-600 rounded-lg px-2 py-1 outline-none focus:ring-1 focus:ring-slate-400 cursor-pointer"
                                >
                                    <option value="Todo">Todo</option>
                                    <option value="In Progress">In Progress</option>
                                    <option value="Done">Done</option>
                                </select>
                            </div>
                        </div>
                        <h3 className={`text-lg font-bold text-slate-900 mb-2 ${task.status === 'Done' ? 'line-through text-slate-400' : ''}`}>{task.title}</h3>
                        <p className="text-sm text-slate-500 mb-6 leading-relaxed line-clamp-3">{task.description}</p>
                        
                        {task.relatedBillboardId && (
                            <div className="mb-4 p-2 bg-indigo-50 border border-indigo-100 rounded-lg text-[10px] text-indigo-600 font-bold uppercase tracking-wide flex items-center gap-2">
                                <Clock size={12}/> Automated Maintenance Task
                            </div>
                        )}
                    </div>
                    
                    <div className="border-t border-slate-50 pt-4 flex items-center justify-between">
                        <div className="flex flex-col gap-1.5">
                            <div className="flex items-center gap-2 text-xs font-medium text-slate-500">
                                <User size={14} className="text-indigo-400"/> {task.assignedTo}
                            </div>
                            <div className="flex items-center gap-2 text-xs font-medium text-slate-500">
                                <Calendar size={14} className="text-indigo-400"/> Due: {task.dueDate}
                            </div>
                        </div>
                        <button 
                            onClick={() => setTaskToDelete(task)} 
                            className="p-2 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all"
                            title="Delete Task"
                        >
                            <Trash2 size={18} />
                        </button>
                    </div>
                </div>
            ))}
            {tasks.length === 0 && (
                <div className="col-span-full py-16 text-center bg-white rounded-3xl border border-dashed border-slate-200">
                    <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-4">
                        <CheckSquare className="text-slate-300" size={32}/>
                    </div>
                    <h3 className="text-lg font-bold text-slate-900 mb-1">No Tasks Found</h3>
                    <p className="text-slate-500 text-sm">Create a new task to get started.</p>
                </div>
            )}
        </div>
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 z-[200] overflow-y-auto">
            <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md transition-opacity" onClick={() => setIsModalOpen(false)} />
            <div className="flex min-h-full items-end justify-center p-4 text-center sm:items-center sm:p-0">
                <div className="relative transform overflow-hidden rounded-3xl bg-white text-left shadow-2xl transition-all sm:my-8 sm:w-full sm:max-w-lg border border-white/20">
                    <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-white sticky top-0 z-10">
                        <h3 className="text-xl font-bold text-slate-900">Create New Task</h3>
                        <button onClick={() => setIsModalOpen(false)} className="p-2 hover:bg-slate-100 rounded-full transition-colors"><X size={20} className="text-slate-400" /></button>
                    </div>
                    <form onSubmit={handleCreate} className="p-8 space-y-6">
                        <MinimalInput label="Task Title" value={newTask.title} onChange={(e: any) => setNewTask({...newTask, title: e.target.value})} required />
                        <div className="group relative pt-4">
                            <textarea value={newTask.description} onChange={(e) => setNewTask({...newTask, description: e.target.value})} placeholder=" " className="peer w-full px-0 py-2.5 border-b border-slate-200 bg-transparent text-slate-800 focus:border-slate-800 focus:ring-0 outline-none transition-all font-medium placeholder-transparent resize-none h-24" />
                            <label className="absolute left-0 top-0 text-xs text-slate-400 font-medium transition-all uppercase tracking-wide">Description</label>
                        </div>
                        <div className="grid grid-cols-2 gap-6">
                            <MinimalSelect label="Assigned To" value={newTask.assignedTo} onChange={(e: any) => setNewTask({...newTask, assignedTo: e.target.value})} options={[{value: 'Unassigned', label: 'Unassigned'}, ...getUsers().map(u => ({value: `${u.firstName} ${u.lastName}`, label: `${u.firstName} ${u.lastName}`}))]} />
                            <MinimalSelect label="Priority" value={newTask.priority} onChange={(e: any) => setNewTask({...newTask, priority: e.target.value})} options={[{value: 'Low', label: 'Low'},{value: 'Medium', label: 'Medium'},{value: 'High', label: 'High'}]} />
                        </div>
                        <MinimalInput label="Due Date" type="date" value={newTask.dueDate} onChange={(e: any) => setNewTask({...newTask, dueDate: e.target.value})} />
                        
                        <button type="submit" className="w-full py-4 text-white bg-slate-900 rounded-xl hover:bg-slate-800 flex items-center justify-center gap-2 shadow-xl font-bold uppercase tracking-wider transition-all mt-4">
                            <Save size={18} /> Save Task
                        </button>
                    </form>
                </div>
            </div>
        </div>
      )}

      {taskToDelete && (
        <div className="fixed inset-0 z-[200] overflow-y-auto">
            <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md transition-opacity" onClick={() => setTaskToDelete(null)} />
            <div className="flex min-h-full items-center justify-center p-4 text-center">
                <div className="relative transform overflow-hidden rounded-2xl bg-white text-left shadow-2xl transition-all sm:my-8 sm:w-full sm:max-w-sm border border-white/20 p-6 text-center">
                    <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4 border-4 border-red-50">
                        <Trash2 className="text-red-500" size={32} />
                    </div>
                    <h3 className="text-xl font-bold text-slate-900 mb-2">Delete Task?</h3>
                    <p className="text-slate-500 mb-6 text-sm">
                        Are you sure you want to delete <span className="font-bold text-slate-700">"{taskToDelete.title}"</span>? This action cannot be undone.
                    </p>
                    <div className="flex gap-3">
                        <button onClick={() => setTaskToDelete(null)} className="flex-1 py-3 text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-xl font-bold uppercase text-xs tracking-wider transition-colors">
                            Cancel
                        </button>
                        <button onClick={handleConfirmDelete} className="flex-1 py-3 text-white bg-red-500 hover:bg-red-600 rounded-xl font-bold uppercase text-xs tracking-wider transition-colors shadow-lg shadow-red-500/30">
                            Delete Permanently
                        </button>
                    </div>
                </div>
            </div>
        </div>
      )}
    </>
  );
};