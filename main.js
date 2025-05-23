document.addEventListener('alpine:init', () => {
    Alpine.data('habitTracker', () => ({
        // State
        habits: [],
        currentDate: Utils.getDateKey(),
        isAwake: false,
        wakeUpTime: '',
        showModal: false,
        showAnalytics: false,
        showSummary: false,
        showMarkdownHelp: false,
        selectedTags: [],
        sortableInstance: null,
        lastActiveInput: 'main',
        
        // Drag state
        isDragging: false,
        dragPosition: 0,
        dragTimeDisplay: '',
        draggingHabitId: null,
        draggedElement: null,
        
        // Form
        editingHabit: null,
        form: { 
            title: '', 
            description: '', 
            time: '09:00', 
            duration: 30, 
            tags: [], 
            subHabits: [],
            isDynamic: false,
            offsetMinutes: 60
        },
        tagInput: '',
        
        // Analytics
        streak: 0,
        weeklyRate: 0,
        dailyStats: {
            today: { completed: 0, total: 0, rate: 0 },
            yesterday: { completed: 0, total: 0, rate: 0 },
            week: { completed: 0, total: 0, rate: 0 },
            allTime: { completed: 0, total: 0, rate: 0 }
        },
        summaryStats: {
            vsYesterday: 0,
            vsWeek: 0
        },
        
        // Timeline
        timeSlots: [],
        currentTimePosition: 0,
        keyPoints: [], // Store key points for position calculations
        
        // Computed
        get completedCount() {
            return this.habits?.filter(h => h?.completed)?.length || 0;
        },
        
        get progressPercent() {
            return this.habits?.length ? Math.round((this.completedCount / this.habits.length) * 100) : 0;
        },
        
        get availableTags() {
            if (!this.habits || !Array.isArray(this.habits)) return [];
            const tags = new Set();
            this.habits.forEach(h => {
                if (h?.tags && Array.isArray(h.tags)) {
                    h.tags.forEach(tag => tags.add(tag));
                }
            });
            return Array.from(tags).sort();
        },
        
        get filteredHabits() {
            if (!this.habits || !Array.isArray(this.habits)) return [];
            if (!this.selectedTags?.length) return this.habits;
            return this.habits.filter(h => 
                h?.tags && Array.isArray(h.tags) && 
                this.selectedTags.some(tag => h.tags.includes(tag))
            );
        },

        // Time Functions
        getCurrentTime() {
            return Utils.getCurrentTime();
        },

        getTimeAgo() {
            const currentMinutes = Utils.getCurrentMinutes();
            const wakeMinutes = Utils.timeToMinutes(this.wakeUpTime);
            const minutesSinceWake = Utils.timeToMinutesSinceWake(
                Utils.minutesToTime(currentMinutes), 
                wakeMinutes
            );
            
            return Utils.formatTimeSinceWake(minutesSinceWake);
        },

        // Calculate time from Y position using interpolation
        calculateTimeFromPosition(yPosition) {
            const container = document.querySelector('.timeline-container');
            if (!container) return null;
            
            const containerRect = container.getBoundingClientRect();
            const relativeY = yPosition - containerRect.top + container.scrollTop;
            
            // Find the two closest time slots
            let closestBefore = null;
            let closestAfter = null;
            
            for (const slot of this.timeSlots) {
                if (slot.position <= relativeY) {
                    if (!closestBefore || slot.position > closestBefore.position) {
                        closestBefore = slot;
                    }
                } else {
                    if (!closestAfter || slot.position < closestAfter.position) {
                        closestAfter = slot;
                    }
                }
            }
            
            if (!closestBefore && !closestAfter) return null;
            
            let targetMinutes;
            
            if (!closestBefore) {
                targetMinutes = closestAfter.time;
            } else if (!closestAfter) {
                targetMinutes = closestBefore.time;
            } else {
                // Interpolate between the two closest slots
                const progress = (relativeY - closestBefore.position) / 
                               (closestAfter.position - closestBefore.position);
                
                // Handle wrap-around for times crossing midnight
                let timeDiff = closestAfter.time - closestBefore.time;
                if (timeDiff < 0) timeDiff += 1440; // Add 24 hours if crossing midnight
                
                targetMinutes = (closestBefore.time + timeDiff * progress) % 1440;
            }
            
            return Utils.minutesToTime(Math.round(targetMinutes));
        },

        // Drag handlers
        handleDragStart(habitId, event) {
            this.isDragging = true;
            this.draggingHabitId = habitId;
            this.draggedElement = document.querySelector(`[data-habit-id="${habitId}"]`);
            document.body.classList.add('dragging');
            this.handleDragMove(event);
        },

        handleDragMove(event) {
            if (!this.isDragging || !this.draggedElement) return;
            
            const container = document.querySelector('.timeline-container');
            if (!container) return;
            
            const containerRect = container.getBoundingClientRect();
            const relativeY = event.clientY - containerRect.top + container.scrollTop;
            
            // Constrain drag position to container bounds
            const minY = 40; // Start after header
            const maxY = Math.max(...this.timeSlots.map(slot => slot.position)) || 800;
            this.dragPosition = Math.max(minY, Math.min(maxY, relativeY));
            
            // Calculate and display the time
            const newTime = this.calculateTimeFromPosition(event.clientY);
            if (newTime) {
                this.dragTimeDisplay = Utils.formatTime(newTime, true);
            }
        },

        handleDragEnd() {
            if (!this.isDragging || !this.draggingHabitId) return;
            
            const container = document.querySelector('.timeline-container');
            const containerRect = container.getBoundingClientRect();
            const absoluteY = this.dragPosition + containerRect.top - container.scrollTop;
            const newTime = this.calculateTimeFromPosition(absoluteY);
            
            if (newTime) {
                const habit = this.habits.find(h => h.id === this.draggingHabitId);
                if (habit) {
                    if (habit.isDynamic) {
                        const wakeMinutes = Utils.timeToMinutes(this.wakeUpTime);
                        const newMinutes = Utils.timeToMinutes(newTime);
                        let offsetMinutes = newMinutes - wakeMinutes;
                        if (offsetMinutes < 0) offsetMinutes += 1440;
                        habit.offsetMinutes = offsetMinutes;
                    } else {
                        habit.time = newTime;
                    }
                    habit.effectiveTime = newTime;
                    
                    this.sortByTime();
                    this.updateTimeline();
                    this.saveData();
                }
            }
            
            document.body.classList.remove('dragging');
            this.isDragging = false;
            this.dragPosition = 0;
            this.dragTimeDisplay = '';
            this.draggingHabitId = null;
            this.draggedElement = null;
        },

        // Initialization
        async init() {
            try {
                this.wakeUpTime = this.getCurrentTime();
                this.timeSlots = this.generateEmptyTimeSlots();
                
                await this.loadData();
                this.calculateAnalytics();
                this.updateTimeline();
                this.updateHighlighting();
                await Notifications.request();
                
                // Update every minute
                setInterval(() => {
                    const newDate = Utils.getDateKey();
                    if (newDate !== this.currentDate) {
                        // New day - reset wake status
                        this.currentDate = newDate;
                        this.isAwake = false;
                        this.wakeUpTime = this.getCurrentTime();
                        this.loadData();
                    }
                    this.updateHighlighting();
                    this.updateCurrentTimePosition();
                    
                    if (!this.isAwake) {
                        this.wakeUpTime = this.getCurrentTime();
                    }
                }, 60000);
                
                this.$nextTick(() => {
                    this.setupDragDrop();
                    this.setupEventListeners();
                });
                
            } catch (error) {
                console.error('Init error:', error);
                this.habits = [];
                this.isAwake = false;
                this.timeSlots = this.generateEmptyTimeSlots();
            }
        },

        // Data Management
        async loadData() {
            try {
                const data = await Storage.load();
                const today = this.currentDate;
                
                // Check if user has woken up today
                this.isAwake = data.awake?.[today] === true;
                this.wakeUpTime = data.wakeUpTimes?.[today] || this.getCurrentTime();
                
                // Load habit templates
                this.habits = (data.templates || []).map(template => {
                    const effectiveTime = template.isDynamic 
                        ? Utils.addMinutesToTime(this.wakeUpTime, template.offsetMinutes || 0)
                        : template.time;
                        
                    return {
                        ...template,
                        effectiveTime,
                        completed: data.completions?.[today]?.includes(template.id) || false,
                        expanded: false,
                        description: template.description || '',
                        subHabits: (template.subHabits || []).map(sub => ({
                            ...sub,
                            description: sub.description || '',
                            completed: data.subCompletions?.[today]?.includes(sub.id) || false
                        }))
                    };
                });
                
                this.sortByTime();
                this.updateTimeline();
            } catch (error) {
                console.error('Load data error:', error);
                this.habits = [];
                this.isAwake = false;
                this.timeSlots = this.generateEmptyTimeSlots();
            }
        },

        async saveData() {
            try {
                const data = await Storage.load();
                const today = this.currentDate;
                
                data.templates = this.habits.map(h => ({
                    id: h.id,
                    title: h.title,
                    description: h.description,
                    time: h.time,
                    effectiveTime: h.effectiveTime,
                    duration: h.duration,
                    tags: h.tags || [],
                    isDynamic: h.isDynamic || false,
                    offsetMinutes: h.offsetMinutes || 0,
                    subHabits: (h.subHabits || []).map(s => ({ 
                        id: s.id, 
                        title: s.title,
                        description: s.description || ''
                    }))
                }));
                
                if (!data.completions) data.completions = {};
                if (!data.subCompletions) data.subCompletions = {};
                if (!data.awake) data.awake = {};
                if (!data.wakeUpTimes) data.wakeUpTimes = {};
                
                data.completions[today] = this.habits.filter(h => h.completed).map(h => h.id);
                data.subCompletions[today] = this.habits.flatMap(h => 
                    (h.subHabits || []).filter(s => s.completed).map(s => s.id)
                );
                data.awake[today] = this.isAwake;
                data.wakeUpTimes[today] = this.wakeUpTime;
                
                await Storage.save(data);
            } catch (error) {
                console.error('Save data error:', error);
            }
        },

        // Timeline Management
        generateEmptyTimeSlots() {
            const slots = [];
            const wakeMinutes = Utils.timeToMinutes(this.wakeUpTime || this.getCurrentTime());
            let currentY = 40;
            
            // Add wake time with label
            slots.push({
                time: wakeMinutes,
                position: currentY,
                label: Utils.formatTime(Utils.minutesToTime(wakeMinutes), true),
                type: 'wake',
                displayLabel: true
            });
            
            // Add regular hour markers
            for (let hour = 1; hour <= 24; hour++) {
                currentY += 30;
                
                const totalMinutes = (wakeMinutes + (hour * 60)) % 1440;
                const hourTime = Math.floor(totalMinutes / 60) * 60;
                const timeStr = Utils.minutesToTime(hourTime);
                
                slots.push({
                    time: hourTime,
                    position: currentY,
                    label: Utils.formatTime(timeStr, false),
                    type: 'hour',
                    displayLabel: true
                });
                
                // Add tick marks for quarters
                for (let quarter = 1; quarter <= 3; quarter++) {
                    currentY += 7.5;
                    const quarterMinutes = (wakeMinutes + (hour * 60) + (quarter * 15)) % 1440;
                    
                    slots.push({
                        time: quarterMinutes,
                        position: currentY,
                        label: '',
                        type: quarter === 2 ? 'half' : 'quarter',
                        displayLabel: false
                    });
                }
            }
            
            return slots;
        },

        updateTimeline() {
            try {
                if (!this.isAwake) {
                    this.timeSlots = this.generateEmptyTimeSlots();
                    this.keyPoints = [];
                    return;
                }
                
                if (!this.habits || !Array.isArray(this.habits)) {
                    this.timeSlots = this.generateEmptyTimeSlots();
                    this.keyPoints = [];
                    return;
                }
                
                const timelineData = Timeline.generate24HourTimeline(this.habits, this.wakeUpTime, 
                    Math.max(800, (this.habits.length * 90) + 200)); // Dynamic height based on number of habits
                this.timeSlots = timelineData.timeSlots || this.generateEmptyTimeSlots();
                
                if (timelineData.positionedHabits) {
                    this.habits.forEach((habit, index) => {
                        const positioned = timelineData.positionedHabits.find(p => p.id === habit.id);
                        if (positioned) {
                            this.habits[index].position = positioned.position;
                        }
                    });
                }
                
                // Build key points for position calculations
                this.buildKeyPoints();
                this.updateCurrentTimePosition();
                
                // Re-setup drag and drop after timeline update
                this.$nextTick(() => {
                    this.setupDragDrop();
                });
            } catch (error) {
                console.error('Update timeline error:', error);
                this.timeSlots = this.generateEmptyTimeSlots();
                this.keyPoints = [];
            }
        },

        buildKeyPoints() {
            const wakeMinutes = Utils.timeToMinutes(this.wakeUpTime);
            this.keyPoints = [];
            
            // Add wake time as start
            this.keyPoints.push({
                minutesSinceWake: 0,
                position: this.timeSlots[0]?.position || 40
            });
            
            // Add all positioned habits
            if (this.habits) {
                this.habits.forEach(habit => {
                    if (habit.position && habit.effectiveTime) {
                        const habitMinutesSinceWake = Utils.timeToMinutesSinceWake(
                            habit.effectiveTime, 
                            wakeMinutes
                        );
                        this.keyPoints.push({
                            minutesSinceWake: habitMinutesSinceWake,
                            position: habit.position
                        });
                    }
                });
            }
            
            // Add end of timeline (24 hours)
            this.keyPoints.push({
                minutesSinceWake: 1440,
                position: this.timeSlots[this.timeSlots.length - 1]?.position || 800
            });
            
            // Sort by minutes since wake
            this.keyPoints.sort((a, b) => a.minutesSinceWake - b.minutesSinceWake);
        },

        updateCurrentTimePosition() {
            try {
                const currentMinutes = Utils.getCurrentMinutes();
                const wakeMinutes = Utils.timeToMinutes(this.wakeUpTime);
                const currentMinutesSinceWake = Utils.timeToMinutesSinceWake(
                    Utils.minutesToTime(currentMinutes), 
                    wakeMinutes
                );
                
                this.currentTimePosition = Timeline.getPositionFromMinutesSinceWake(
                    currentMinutesSinceWake,
                    this.keyPoints
                );
            } catch (error) {
                console.error('Update current time position error:', error);
                this.currentTimePosition = 100;
            }
        },

        // Habit Management
        toggleCompletion(habit) {
            if (!habit) return;
            
            habit.completed = !habit.completed;
            if (habit.completed && habit.subHabits) {
                habit.subHabits.forEach(sub => sub.completed = true);
                
                const element = document.querySelector(`[data-habit-id="${habit.id}"]`);
                if (element) {
                    element.classList.add('completion-celebration');
                    setTimeout(() => element.classList.remove('completion-celebration'), 600);
                }
            }
            
            this.updateAfterChange();
        },

        toggleSubHabit(habit, subHabit) {
            if (!habit || !subHabit) return;
            
            subHabit.completed = !subHabit.completed;
            this.updateAfterChange();
        },

        editHabit(habit) {
            if (!habit) return;
            
            // Recalculate effective time in case wake time changed
            if (habit.isDynamic) {
                habit.effectiveTime = Utils.addMinutesToTime(this.wakeUpTime, habit.offsetMinutes || 0);
            }
            
            this.editingHabit = habit;
            this.form = {
                title: habit.title || '',
                description: habit.description || '',
                time: habit.time || habit.effectiveTime || '09:00',
                duration: habit.duration || 30,
                tags: Array.isArray(habit.tags) ? [...habit.tags] : [],
                subHabits: Array.isArray(habit.subHabits) ? habit.subHabits.map(s => ({ 
                    ...s,
                    description: s.description || '' 
                })) : [],
                isDynamic: habit.isDynamic || false,
                offsetMinutes: habit.offsetMinutes || 60
            };
            this.showModal = true;
        },

        deleteHabit(habit) {
            if (!habit) return;
            
            if (confirm(`Delete "${habit.title}"?`)) {
                this.habits = this.habits.filter(h => h.id !== habit.id);
                this.updateAfterChange();
            }
        },

        saveHabit() {
            if (!this.form.title?.trim()) return;
            
            try {
                const habitData = {
                    id: this.editingHabit?.id || Utils.generateId(),
                    title: Utils.sanitize(this.form.title),
                    description: this.form.description || '',  // Don't sanitize to preserve markdown
                    time: this.form.time || '09:00',
                    duration: parseInt(this.form.duration) || 30,
                    tags: Array.isArray(this.form.tags) ? this.form.tags.filter(Boolean) : [],
                    isDynamic: this.form.isDynamic || false,
                    offsetMinutes: parseInt(this.form.offsetMinutes) || 0,
                    subHabits: Array.isArray(this.form.subHabits) ? 
                        this.form.subHabits.filter(s => s?.title?.trim()).map(s => ({
                            id: s.id || Utils.generateId(),
                            title: Utils.sanitize(s.title),
                            description: s.description || '',  // Don't sanitize to preserve markdown
                            completed: false
                        })) : [],
                    completed: false,
                    expanded: false
                };
                
                habitData.effectiveTime = habitData.isDynamic 
                    ? Utils.addMinutesToTime(this.wakeUpTime, habitData.offsetMinutes)
                    : habitData.time;
                
                if (this.editingHabit) {
                    const index = this.habits.findIndex(h => h.id === this.editingHabit.id);
                    if (index >= 0) {
                        this.habits[index] = { ...this.habits[index], ...habitData };
                    }
                } else {
                    this.habits.push(habitData);
                }
                
                this.closeModal();
                this.updateAfterChange();
            } catch (error) {
                console.error('Save habit error:', error);
            }
        },

        // Centralized update method
        updateAfterChange() {
            this.sortByTime();
            this.updateTimeline();
            this.calculateAnalytics();
            this.updateHighlighting();
            this.saveData().catch(error => {
                console.error('Error saving data:', error);
            });
        },

        // Highlighting
        updateHighlighting() {
            try {
                const currentMinutes = Utils.getCurrentMinutes();
                const wakeMinutes = Utils.timeToMinutes(this.wakeUpTime);
                const currentMinutesSinceWake = Utils.timeToMinutesSinceWake(
                    Utils.minutesToTime(currentMinutes), 
                    wakeMinutes
                );
                
                let nextHabit = null;
                let minDiff = Infinity;
                
                this.habits.forEach(habit => {
                    if (!habit.effectiveTime) return;
                    
                    const habitMinutesSinceWake = Utils.timeToMinutesSinceWake(
                        habit.effectiveTime, 
                        wakeMinutes
                    );
                    
                    // Calculate warning time (habit time minus duration)
                    const warningMinutesSinceWake = habitMinutesSinceWake - (habit.duration || 30);
                    
                    // Check if habit is overdue based on minutes since wake
                    habit.isOverdue = !habit.completed && currentMinutesSinceWake > habitMinutesSinceWake;
                    habit.isCurrent = false;
                    
                    if (!habit.completed) {
                        if (currentMinutesSinceWake > habitMinutesSinceWake) {
                            // Overdue - red background
                            habit.bgColor = 'rgb(254, 226, 226)';
                        } else if (currentMinutesSinceWake >= warningMinutesSinceWake && currentMinutesSinceWake <= habitMinutesSinceWake) {
                            // Warning period - gradient from yellow to red
                            const progress = (currentMinutesSinceWake - warningMinutesSinceWake) / (habit.duration || 30);
                            const red = Math.round(220 + (254 - 220) * progress);
                            const green = Math.round(252 - (252 - 226) * progress);
                            const blue = Math.round(231 - (231 - 226) * progress);
                            habit.bgColor = `rgb(${red}, ${green}, ${blue})`;
                        } else if (habitMinutesSinceWake > currentMinutesSinceWake) {
                            // Future habit - white background
                            habit.bgColor = 'rgb(255, 255, 255)';
                            const diff = habitMinutesSinceWake - currentMinutesSinceWake;
                            if (diff < minDiff) {
                                minDiff = diff;
                                nextHabit = habit;
                            }
                        }
                    } else {
                        // Completed - green background
                        habit.bgColor = 'rgb(220, 252, 231)';
                    }
                });
                
                if (nextHabit) {
                    nextHabit.isCurrent = true;
                    nextHabit.bgColor = 'rgb(220, 252, 231)';
                }
            } catch (error) {
                console.error('Update highlighting error:', error);
            }
        },

        // Drag & Drop
        setupDragDrop() {
            try {
                const container = document.getElementById('habits-container');
                if (container && typeof Sortable !== 'undefined') {
                    // Destroy existing instance if it exists
                    if (this.sortableInstance) {
                        this.sortableInstance.destroy();
                    }
                    
                    this.sortableInstance = Sortable.create(container, {
                        handle: '.drag-handle',
                        animation: 0, // Disable animation
                        ghostClass: 'sortable-ghost-hidden', // Use a class that hides the ghost
                        dragClass: 'sortable-drag-hidden', // Hide the dragging element
                        forceFallback: true,
                        fallbackClass: 'sortable-fallback-hidden', // Hide the fallback element
                        onStart: (evt) => {
                            const habitId = evt.item.getAttribute('data-habit-id');
                            // Hide the original item being dragged
                            evt.item.style.visibility = 'hidden';
                            this.handleDragStart(habitId, evt.originalEvent || evt);
                        },
                        onMove: (evt) => {
                            this.handleDragMove(evt.originalEvent || evt);
                            return false; // Prevent default sorting behavior
                        },
                        onEnd: (evt) => {
                            // Show the original item again
                            evt.item.style.visibility = 'visible';
                            evt.preventDefault();
                            this.handleDragEnd();
                        }
                    });
                }
            } catch (error) {
                console.error('Setup drag drop error:', error);
            }
        },

        // Modal Management
        closeModal() {
            this.showModal = false;
            this.showMarkdownHelp = false;
            this.editingHabit = null;
            this.form = { 
                title: '', 
                description: '', 
                time: '09:00', 
                duration: 30, 
                tags: [], 
                subHabits: [],
                isDynamic: false,
                offsetMinutes: 60
            };
            this.tagInput = '';
            this.lastActiveInput = 'main';
        },

        // Tag Management
        addTag() {
            const tag = this.tagInput?.trim()?.toLowerCase();
            if (tag && !this.form.tags.includes(tag)) {
                this.form.tags.push(tag);
                this.tagInput = '';
            }
        },

        toggleTagFilter(tag) {
            if (!this.selectedTags) this.selectedTags = [];
            const index = this.selectedTags.indexOf(tag);
            if (index >= 0) {
                this.selectedTags.splice(index, 1);
            } else {
                this.selectedTags.push(tag);
            }
        },

        addSubHabit() {
            if (!this.form.subHabits) this.form.subHabits = [];
            this.form.subHabits.push({ id: Utils.generateId(), title: '', description: '', completed: false });
        },

        // Day Management
        async wakeUp() {
            this.isAwake = true;
            this.wakeUpTime = this.getCurrentTime();
            
            // Save wake status immediately
            await this.saveData();
            
            // Reload data with new wake time
            await this.loadData();
            
            Notifications.scheduleAllHabits(this.habits, this.wakeUpTime);
        },

        endDay() {
            this.calculateSummaryStats();
            this.showSummary = true;
        },

        async goToSleep() {
            this.isAwake = false;
            this.showSummary = false;
            
            await this.saveHistory();
            await this.saveData();
        },

        async saveHistory() {
            try {
                const today = this.currentDate;
                const historyData = {
                    date: today,
                    habits: this.habits.map(h => ({
                        id: h.id,
                        title: h.title,
                        completed: h.completed,
                        effectiveTime: h.effectiveTime,
                        duration: h.duration,
                        tags: h.tags || [],
                        isDynamic: h.isDynamic || false,
                        subHabitsCompleted: (h.subHabits || []).filter(s => s.completed).length,
                        subHabitsTotal: (h.subHabits || []).length
                    })),
                    stats: {
                        completed: this.completedCount,
                        total: this.habits.length,
                        rate: this.progressPercent,
                        wakeUpTime: this.wakeUpTime
                    },
                    dailyStats: this.dailyStats,
                    timestamp: new Date().toISOString()
                };
                
                await Storage.saveHistory(historyData);
                
                const data = await Storage.load();
                if (!data.history) data.history = {};
                data.history[today] = historyData;
                await Storage.save(data);
            } catch (error) {
                console.error('Save history error:', error);
            }
        },

        // Analytics
        calculateAnalytics() {
            try {
                this.$nextTick(async () => {
                    const data = await Storage.load();
                    this.streak = Analytics.calculateStreak(data.completions || {}, this.habits.length);
                    this.weeklyRate = Analytics.calculateWeeklyRate(data.completions || {}, this.habits.length);
                    this.dailyStats = Analytics.calculateDailyStats(data, this.habits) || this.dailyStats;
                });
            } catch (error) {
                console.error('Calculate analytics error:', error);
            }
        },

        calculateSummaryStats() {
            try {
                if (this.dailyStats) {
                    this.summaryStats = {
                        vsYesterday: this.dailyStats.today.rate - this.dailyStats.yesterday.rate,
                        vsWeek: this.dailyStats.today.rate - this.dailyStats.week.rate
                    };
                }
            } catch (error) {
                console.error('Calculate summary stats error:', error);
                this.summaryStats = { vsYesterday: 0, vsWeek: 0 };
            }
        },

        // Utility Methods
        sortByTime() {
            try {
                const wakeMinutes = Utils.timeToMinutes(this.wakeUpTime);
                this.habits.sort((a, b) => {
                    const aMinutes = Utils.timeToMinutesSinceWake(a.effectiveTime, wakeMinutes);
                    const bMinutes = Utils.timeToMinutesSinceWake(b.effectiveTime, wakeMinutes);
                    return aMinutes - bMinutes;
                });
            } catch (error) {
                console.error('Sort by time error:', error);
            }
        },

        formatTime(timeStr) {
            return Utils.formatTime(timeStr, true);
        },

        // Markdown Functions
        parseMarkdown(text) {
            if (!text || typeof window.markdownit === 'undefined') return text || '';
            
            try {
                const md = this.initializeMarkdownParser();
                const processedText = this.preprocessMarkdown(text);
                return md.render(processedText);
            } catch (error) {
                console.error('Markdown parsing error:', error);
                return text || '';
            }
        },
        
        initializeMarkdownParser() {
            const md = window.markdownit({
                html: true,
                breaks: true,
                linkify: true,
                typographer: true
            });
            
            // Custom image renderer
            md.renderer.rules.image = this.createImageRenderer();
            
            return md;
        },
        
        createImageRenderer() {
            return function(tokens, idx, options, env, self) {
                const token = tokens[idx];
                const srcIndex = token.attrIndex('src');
                const altIndex = token.attrIndex('alt');
                const titleIndex = token.attrIndex('title');
                
                if (srcIndex < 0) return '';
                
                const src = token.attrs[srcIndex][1];
                const alt = altIndex >= 0 ? token.attrs[altIndex][1] : '';
                const title = titleIndex >= 0 ? token.attrs[titleIndex][1] : '';
                
                return `<a href="${src}" target="_blank" rel="noopener noreferrer" class="inline-block markdown-image-link">
                          <img src="${src}" alt="${alt}" title="${title}" 
                               class="max-w-full h-auto rounded-md cursor-pointer hover:opacity-90 transition-opacity markdown-image" 
                               style="max-height: 300px; object-fit: contain; display: block; margin: 0.5rem 0;" />
                        </a>`;
            };
        },
        
        preprocessMarkdown(text) {
            const videoRegex = /!video\[(.*?)\]\((.*?)\)/g;
            
            return text.replace(videoRegex, (match, alt, url) => {
                const youtubeId = this.getYoutubeId(url);
                const vimeoId = this.getVimeoId(url);
                const imgurId = this.getImgurId(url);
                
                if (youtubeId) {
                    return this.createYouTubeEmbed(youtubeId);
                } else if (vimeoId) {
                    return this.createVimeoEmbed(vimeoId);
                } else if (imgurId) {
                    return this.createImgurVideoEmbed(url);
                }
                
                // Default video embed for other sources
                return this.createGenericVideoEmbed(url);
            });
        },
        
        getYoutubeId(url) {
            const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/;
            const match = url.match(regExp);
            return (match && match[2].length === 11) ? match[2] : null;
        },
        
        getVimeoId(url) {
            const regExp = /^.*(vimeo\.com\/)((channels\/[A-z]+\/)|(groups\/[A-z]+\/videos\/))?([0-9]+)/;
            const match = url.match(regExp);
            return (match && match[5]) ? match[5] : null;
        },
        
        getImgurId(url) {
            const regExp = /^.*imgur\.com\/([a-zA-Z0-9]+)\.(mp4|webm)$/;
            const match = url.match(regExp);
            return match ? match[1] : null;
        },
        
        createYouTubeEmbed(videoId) {
            return `<div class="video-embed youtube-embed">
                      <iframe width="100%" height="315" 
                              src="https://www.youtube.com/embed/${videoId}" 
                              frameborder="0" 
                              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" 
                              allowfullscreen></iframe>
                    </div>`;
        },
        
        createVimeoEmbed(videoId) {
            return `<div class="video-embed vimeo-embed">
                      <iframe width="100%" height="315" 
                              src="https://player.vimeo.com/video/${videoId}" 
                              frameborder="0" 
                              allow="autoplay; fullscreen; picture-in-picture" 
                              allowfullscreen></iframe>
                    </div>`;
        },
        
        createImgurVideoEmbed(url) {
            return `<div class="video-embed imgur-embed">
                      <video width="100%" height="auto" controls loop muted preload="metadata">
                        <source src="${url}" type="video/mp4">
                        Your browser does not support the video tag.
                      </video>
                    </div>`;
        },
        
        createGenericVideoEmbed(url) {
            // Check if it's a direct video file
            if (url.match(/\.(mp4|webm|ogg)$/i)) {
                return `<div class="video-embed generic-embed">
                          <video width="100%" height="auto" controls preload="metadata">
                            <source src="${url}" type="video/${url.split('.').pop()}">
                            Your browser does not support the video tag.
                          </video>
                        </div>`;
            }
            // Otherwise return a link
            return `<a href="${url}" target="_blank" rel="noopener noreferrer" class="text-blue-600 hover:text-blue-800 underline">${url}</a>`;
        },
        
        insertMarkdown(before, after) {
            let targetInput;
            
            if (this.lastActiveInput === 'main') {
                targetInput = this.$refs.mainDescription;
            } else if (this.lastActiveInput.startsWith('sub')) {
                const index = parseInt(this.lastActiveInput.substring(3));
                targetInput = this.$refs[`subDescription${index}`];
            }
            
            if (!targetInput) return;
            
            const start = targetInput.selectionStart;
            const end = targetInput.selectionEnd;
            const text = targetInput.value;
            const selectedText = text.substring(start, end);
            
            // Determine cursor position based on what we're inserting
            let cursorOffset = before.length;
            let insertText = before + selectedText + after;
            
            // Special handling for different markdown types
            if (before === '**' && after === '**') {
                // Bold - cursor in middle if no selection
                if (!selectedText) {
                    cursorOffset = before.length;
                }
            } else if (before === '*' && after === '*') {
                // Italic - cursor in middle if no selection
                if (!selectedText) {
                    cursorOffset = before.length;
                }
            } else if (before === '__' && after === '__') {
                // Underline - cursor in middle if no selection
                if (!selectedText) {
                    cursorOffset = before.length;
                }
            } else if (before === '# ' && after === '') {
                // Header - cursor after the hash and space
                cursorOffset = before.length;
            } else if (before.includes('[blank]')) {
                // Link or media - cursor in parentheses
                cursorOffset = before.length + 1; // Position after opening parenthesis
            }
            
            const newText = text.substring(0, start) + insertText + text.substring(end);
            
            if (this.lastActiveInput === 'main') {
                this.form.description = newText;
            } else if (this.lastActiveInput.startsWith('sub')) {
                const index = parseInt(this.lastActiveInput.substring(3));
                this.form.subHabits[index].description = newText;
            }
            
            // Set cursor position
            this.$nextTick(() => {
                targetInput.focus();
                const newCursorPos = start + cursorOffset;
                targetInput.setSelectionRange(newCursorPos, newCursorPos);
            });
        },

        // Event Listeners
        setupEventListeners() {
            try {
                document.addEventListener('keydown', this.handleKeydown.bind(this));
                
                window.addEventListener('resize', Utils.debounce(() => {
                    this.updateTimeline();
                }, 300));
                
                document.addEventListener('visibilitychange', () => {
                    if (!document.hidden) {
                        this.updateHighlighting();
                        this.updateCurrentTimePosition();
                    }
                });
                
                // Global mouse events for drag handling
                document.addEventListener('mousemove', (e) => {
                    if (this.isDragging) {
                        this.handleDragMove(e);
                    }
                });
                
                document.addEventListener('mouseup', () => {
                    if (this.isDragging) {
                        this.handleDragEnd();
                    }
                });
                
                // Touch events for mobile drag support
                document.addEventListener('touchmove', (e) => {
                    if (this.isDragging && e.touches.length > 0) {
                        const touch = e.touches[0];
                        this.handleDragMove({ clientY: touch.clientY });
                    }
                }, { passive: false });
                
                document.addEventListener('touchend', () => {
                    if (this.isDragging) {
                        this.handleDragEnd();
                    }
                });
            } catch (error) {
                console.error('Setup event listeners error:', error);
            }
        },

        handleKeydown(event) {
            if (event.target.tagName === 'INPUT' || event.target.tagName === 'TEXTAREA') return;
            
            try {
                switch(event.key.toLowerCase()) {
                    case 'a':
                        if (!this.showModal) {
                            this.showModal = true;
                            event.preventDefault();
                        }
                        break;
                    case 'escape':
                        if (this.showModal) {
                            this.closeModal();
                            event.preventDefault();
                        } else if (this.showAnalytics) {
                            this.showAnalytics = false;
                            event.preventDefault();
                        }
                        break;
                }
            } catch (error) {
                console.error('Handle keydown error:', error);
            }
        }
    }));
});

console.log('Habit Tracker Application Loaded');