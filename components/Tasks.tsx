import React, { useState } from 'react';
import { Task } from '../types';
import { getTasks, addTask, updateTask, deleteTask, getUsers, getBillboards, updateBillboard } from '../services/mockData';
import { CheckSquare, Plus, Trash2, Calendar, User, Clock, X, Save, AlertTriangle, Flag, CheckCircle2, Search } from 'lucide-react';

const MinimalInput = ({ label, value, onChange, type = "text", required = false }: any) => (
  <div className="group relative">
    <input type={type} required={required} value={value} onChange={onChange} placeholder=" " className="peer w-full px-0 py-2.5 border-b border-slate-200 bg-transparent text-slate-800 focus:border-slate-800 focus:ring-0 outline-none transition-all font-medium placeholder-transparent" />
    <label className="absolute left-0 -top-2.5 text-xs text-slate-900 font-medium transition-all peer-placeholder-shown:text-sm peer-placeholder-shown:text-slate-900 peer-placeholder-shown:top-2.5 peer-focus:-top-2.5 peer-focus:text-xs peer-focus:text-slate-800 uppercase tracking-wide">{label}</label>
  </div>
);

const MinimalSelect = ({ label, value, onChange, options }: any) => (
  <div className="group relative">
    <select value={value} onChange={onChange} className="peer w-full px-0 py-2.5 border-b border-slate-200 bg-transparent text-slate-800 focus:border-slate-800 focus:ring-0 outline-none transition-all font-medium appearance-none cursor-pointer">
      {options.map((opt: any) => (<option key={opt.value} value={opt.value}>{opt.label}</option>))}
    </select>
    <label className="absolute left-0 -top-2.5 text-xs text-slate-900 font-medium uppercase tracking-wide">{label}</label>
  </div>
);

export const Tasks: React.FC = () => {
  const [tasks, setTasks] = useState<Task[]>(getTasks());
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [taskToDelete, setTaskToDelete] = useState<Task | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  
  const [newTask, setNewTask] = useState<Partial<Task>>({
    title: '', description: '', assignedTo: 'Unassigned', priority: 'Medium', status: 'Todo', dueDate: new Date().toISOString().split('T')[0]
  });

  const handleCreate = async (e: React.FormEvent) => {
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
    try {
      await addTask(task);
      setTasks(getTasks());
      setIsModalOpen(false);
      setNewTask({ title: '', description: '', assignedTo: 'Unassigned', priority: 'Medium', status: 'Todo', dueDate: new Date().toISOString().split('T')[0] });
    } catch (err: any) {
      alert(`Failed: ${err?.message || 'Server error. Please try again.'}`);
    }
  };

  const handleStatusChange = async (task: Task, newStatus: 'Todo' | 'In Progress' | 'Done') => {
      // Logic for Maintenance Tasks
      if (newStatus === 'Done' && task.relatedBillboardId) {
          const billboard = getBillboards().find(b => b.id === task.relatedBillboardId);
          if (billboard) {
              const today = new Date().toISOString().split('T')[0];
              try {
                  await updateBillboard({ ...billboard, lastMaintenanceDate: today });
                  alert(`Maintenance recorded for ${billboard.name}. Next check due in 3 months.`);
              } catch (err: any) {
                  alert(`Failed: ${err?.message || 'Server error. Please try again.'}`);
                  return;
              }
          }
      }

      try {
          await updateTask({ ...task, status: newStatus });
          setTasks(getTasks());
      } catch (err: any) {
          alert(`Failed: ${err?.message || 'Server error. Please try again.'}`);
      }
  };

  const handleConfirmDelete = async () => {
      if (taskToDelete) {
          try {
              await deleteTask(taskToDelete.id);
              setTasks(getTasks());
              setTaskToDelete(null);
          } catch (err: any) {
              alert(`Failed: ${err?.message || 'Server error. Please try again.'}`);
          }
      }
  };

  const getPriorityColor = (p: string) => {
      switch(p) {
          case 'High': return 'text-red-600 bg-red-50 border-red-100';
          case 'Medium': return 'text-amber-600 bg-amber-50 border-amber-100';
          default: return 'text-slate-900 bg-slate-50 border-slate-100';
      }
  };  const filteredTasks = tasks.filter(task => {
      const q = searchTerm.toLowerCase();
      return !q || task.title.toLowerCase().includes(q) || task.description.toLowerCase().includes(q) || task.assignedTo.toLowerCase().includes(q);
  });

  return (
    <>
      <div className="space-y-8 animate-fade-in">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h2 className="text-4xl font-extrabold tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-slate-900 to-slate-600 mb-2">Tasks & Maintenance</h2>
            <p className="text-slate-900 font-medium">Track operational activities and staff assignments</p>
          </div>
          <div className="flex gap-4 w-full sm:w-auto justify-end">
            <div className="relative group flex-1 sm:w-56">
              <Search className="absolute left-3 top-2.5 text-slate-900 group-focus-within:text-slate-800 transition-colors" size={16} />
              <input type="text" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} placeholder="Search tasks..." className="w-full pl-9 pr-4 py-2 border border-slate-200 rounded-xl bg-slate-50 outline-none focus:bg-white focus:border-slate-800 transition-all text-sm" />
            </div>
            <button onClick={() => setIsModalOpen(true)} className="bg-slate-900 text-white px-5 py-2.5 rounded-full text-sm font-bold uppercase tracking-wider hover:bg-slate-800 shadow-lg hover:shadow-xl transition-all hover:scale-105 flex items-center gap-2">
              <Plus size={18} /> <span className="hidden sm:inline">New Task</span><span className="sm:hidden">New</span>
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredTasks.map(task => (
                <div key={task.id} className={`bg-white rounded-2xl p-6 border border-slate-100 shadow-sm hover:shadow-md transition-all group flex flex-col justify-between h-full ${task.status === 'Done' ? 'opacity-75' : ''}`}>
                    <div>
                        <div className="flex justify-between items-start mb-4">
                            <div className={`px-2.5 py-1 rounded-xl text-[10px] font-bold uppercase tracking-wider border ${getPriorityColor(task.priority)}`}>
                                {task.priority} Priority
                            </div>
                            <div className="flex gap-2">
                                <select 
                                    value={task.status} 
                                    onChange={(e) => handleStatusChange(task, e.target.value as any)}
                                    className="bg-slate-50 border border-slate-200 text-xs font-bold text-slate-900 rounded-xl px-2 py-1 outline-none focus:ring-1 focus:ring-slate-400 cursor-pointer"
                                >
                                    <option value="Todo">Todo</option>
                                    <option value="In Progress">In Progress</option>
                                    <option value="Done">Done</option>
                                </select>
                            </div>
                        </div>
                        <h3 className={`text-lg font-bold text-slate-900 mb-2 ${task.status === 'Done' ? 'line-through text-slate-900' : ''}`}>{task.title}</h3>
                        <p className="text-sm text-slate-900 mb-6 leading-relaxed line-clamp-3">{task.description}</p>
                        
                        {task.relatedBillboardId && (
                            <div className="mb-4 p-2 bg-indigo-50 border border-indigo-100 rounded-xl text-[10px] text-indigo-600 font-bold uppercase tracking-wide flex items-center gap-2">
                                <Clock size={12}/> Automated Maintenance Task
                            </div>
                        )}
                    </div>
                    
                    <div className="border-t border-slate-50 pt-4 flex items-center justify-between">
                        <div className="flex flex-col gap-1.5">
                            <div className="flex items-center gap-2 text-xs font-medium text-slate-900">
                                <User size={14} className="text-indigo-400"/> {task.assignedTo}
                            </div>
                            <div className="flex items-center gap-2 text-xs font-medium text-slate-900">
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
            {filteredTasks.length === 0 && (
                <div className="col-span-full py-16 text-center bg-white rounded-3xl border border-dashed border-slate-200">
                    <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-4">
                        {searchTerm ? <Search className="text-slate-300" size={32}/> : <CheckSquare className="text-slate-300" size={32}/>}
                    </div>
                    <h3 className="text-lg font-bold text-slate-900 mb-1">{searchTerm ? 'No tasks match your search' : 'No Tasks Found'}</h3>
                    <p className="text-slate-900 text-sm">{searchTerm ? 'Try adjusting your search terms.' : 'Create a new task to get started.'}</p>
                </div>
            )}
        </div>
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md flex items-center justify-center z-50 p-4 transition-all">
            <div className="bg-white/95 backdrop-blur-xl rounded-3xl shadow-2xl max-w-lg w-full border border-white/20 max-h-[90vh] overflow-y-auto">
                {/* Sticky header */}
                <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-white sticky top-0 z-10">
                    <div>
                        <h3 className="text-xl font-bold text-slate-900">Create New Task</h3>
                        <p className="text-xs text-slate-900 mt-0.5">Add an operational task and assign it to a team member</p>
                    </div>
                    <button onClick={() => setIsModalOpen(false)} className="p-2 hover:bg-slate-100 rounded-full transition-colors">
                        <X size={20} className="text-slate-900" />
                    </button>
                </div>

                <form onSubmit={handleCreate} className="p-8 space-y-6">
                    {/* Task Identity */}
                    <div>
                        <p className="text-xs font-bold uppercase tracking-wider text-slate-900 mb-3">Task Details</p>
                        <div className="space-y-4">
                            <MinimalInput
                                label="Task Title"
                                value={newTask.title}
                                onChange={(e: any) => setNewTask({...newTask, title: e.target.value})}
                                required
                            />
                            <div className="group relative pt-4">
                                <textarea
                                    value={newTask.description}
                                    onChange={(e) => setNewTask({...newTask, description: e.target.value})}
                                    placeholder=" "
                                    className="peer w-full px-0 py-2.5 border-b border-slate-200 bg-transparent text-slate-800 focus:border-slate-800 focus:ring-0 outline-none transition-all font-medium placeholder-transparent resize-none h-24"
                                />
                                <label className="absolute left-0 top-0 text-xs text-slate-900 font-medium transition-all uppercase tracking-wide">Description</label>
                            </div>
                        </div>
                    </div>

                    {/* Assignment */}
                    <div>
                        <p className="text-xs font-bold uppercase tracking-wider text-slate-900 mb-3">Assignment & Priority</p>
                        <div className="grid grid-cols-2 gap-6">
                            <MinimalSelect
                                label="Assigned To"
                                value={newTask.assignedTo}
                                onChange={(e: any) => setNewTask({...newTask, assignedTo: e.target.value})}
                                options={[{value: 'Unassigned', label: 'Unassigned'}, ...getUsers().map(u => ({value: `${u.firstName} ${u.lastName}`, label: `${u.firstName} ${u.lastName}`}))]}
                            />
                            <MinimalSelect
                                label="Priority"
                                value={newTask.priority}
                                onChange={(e: any) => setNewTask({...newTask, priority: e.target.value})}
                                options={[{value: 'Low', label: 'Low'},{value: 'Medium', label: 'Medium'},{value: 'High', label: 'High'}]}
                            />
                        </div>
                        {newTask.priority === 'High' && (
                            <p className="text-[10px] text-red-500 mt-2 font-medium">High priority tasks appear at the top of the board and trigger immediate alerts.</p>
                        )}
                    </div>

                    {/* Schedule */}
                    <div>
                        <p className="text-xs font-bold uppercase tracking-wider text-slate-900 mb-3">Schedule</p>
                        <MinimalInput
                            label="Due Date"
                            type="date"
                            value={newTask.dueDate}
                            onChange={(e: any) => setNewTask({...newTask, dueDate: e.target.value})}
                        />
                        <p className="text-[10px] text-slate-900 mt-2">The date by which this task must be completed. Overdue tasks are flagged automatically.</p>
                    </div>

                    {/* Priority preview badge */}
                    {(newTask.title || '') && (
                        <div className="bg-slate-50 rounded-2xl border border-slate-100 p-4 flex items-start gap-3">
                            <div className={`p-2 rounded-xl ${newTask.priority === 'High' ? 'bg-red-50 text-red-500' : newTask.priority === 'Medium' ? 'bg-amber-50 text-amber-500' : 'bg-slate-100 text-slate-900'}`}>
                                <Flag size={14} />
                            </div>
                            <div>
                                <p className="text-xs font-bold uppercase tracking-wider text-slate-900 mb-0.5">Preview</p>
                                <p className="font-semibold text-slate-800 text-sm">{newTask.title || 'Task title…'}</p>
                                <p className="text-[10px] text-slate-900 mt-0.5">{newTask.priority} priority &bull; Due {newTask.dueDate} &bull; {newTask.assignedTo || 'Unassigned'}</p>
                            </div>
                        </div>
                    )}

                    <div className="flex gap-3 pt-2">
                        <button
                            type="button"
                            onClick={() => setIsModalOpen(false)}
                            className="flex-1 py-3 text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-2xl font-bold uppercase text-xs tracking-wider transition-all hover:-translate-y-0.5"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            className="flex-1 py-3 text-white bg-slate-900 hover:bg-slate-800 rounded-2xl font-bold uppercase text-xs tracking-wider transition-all shadow-md hover:shadow-lg hover:-translate-y-0.5 flex items-center justify-center gap-2"
                        >
                            <Save size={14} /> Save Task
                        </button>
                    </div>
                </form>
            </div>
        </div>
      )}

      {taskToDelete && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md flex items-center justify-center z-50 p-4 transition-all">
            <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm border border-white/20">
                {/* Red-tinted header */}
                <div className="p-6 border-b border-red-100 bg-red-50 flex items-start gap-4 rounded-t-3xl">
                    <div className="w-12 h-12 bg-red-100 rounded-2xl flex items-center justify-center shrink-0 border-2 border-red-200">
                        <Trash2 className="text-red-600" size={22} />
                    </div>
                    <div>
                        <h3 className="text-lg font-bold text-red-900">Delete Task?</h3>
                        <p className="text-xs text-red-500 mt-0.5 font-medium">This action cannot be undone.</p>
                    </div>
                </div>

                <div className="p-6 space-y-4">
                    {/* Entity being deleted */}
                    <div className="bg-slate-50 rounded-xl border border-slate-100 p-4 space-y-2">
                        <p className="text-xs font-bold uppercase tracking-wider text-slate-900 mb-2">Task Being Deleted</p>
                        <p className="font-bold text-slate-900">{taskToDelete.title}</p>
                        {taskToDelete.description && (
                            <p className="text-sm text-slate-900 line-clamp-2">{taskToDelete.description}</p>
                        )}
                        <div className="flex items-center gap-4 pt-1">
                            <span className={`px-2 py-0.5 rounded-xl text-[10px] font-bold uppercase tracking-wider border ${getPriorityColor(taskToDelete.priority)}`}>
                                {taskToDelete.priority}
                            </span>
                            <span className="text-xs text-slate-900 flex items-center gap-1">
                                <User size={11} /> {taskToDelete.assignedTo}
                            </span>
                            <span className="text-xs text-slate-900 flex items-center gap-1">
                                <Calendar size={11} /> {taskToDelete.dueDate}
                            </span>
                        </div>
                    </div>

                    {/* Cascading impact warning */}
                    <div className="bg-amber-50 border border-amber-100 rounded-xl p-3 flex items-start gap-2">
                        <AlertTriangle size={15} className="text-amber-500 shrink-0 mt-0.5" />
                        <p className="text-xs text-amber-700 font-medium">
                            {taskToDelete.relatedBillboardId
                                ? 'This is an automated maintenance task. Deleting it will not undo any maintenance records already saved.'
                                : 'Any notes or progress associated with this task will be permanently removed.'}
                        </p>
                    </div>

                    <div className="flex gap-3 pt-1">
                        <button
                            onClick={() => setTaskToDelete(null)}
                            className="flex-1 py-3 text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-2xl font-bold uppercase text-xs tracking-wider transition-all hover:-translate-y-0.5"
                        >
                            Keep Task
                        </button>
                        <button
                            onClick={handleConfirmDelete}
                            className="flex-1 py-3 text-white bg-red-600 hover:bg-red-700 rounded-2xl font-bold uppercase text-xs tracking-wider transition-all shadow-md hover:-translate-y-0.5 shadow-lg shadow-red-600/20"
                        >
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