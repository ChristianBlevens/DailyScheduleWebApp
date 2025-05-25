dayjs.extend(window.dayjs_plugin_customParseFormat);
dayjs.extend(window.dayjs_plugin_duration);

document.addEventListener('alpine:init', () => {
    Alpine.data('habitTracker', () => ({
        habits: [],
        currentDate: TimeUtils.getDateKey(),
        currentWakeDayKey: null,
        isAwake: false,
        wakeUpTime: '',
        showModal: false,
        showAnalytics: false,
        showSummary: false,
        showMarkdownHelp: false,
        selectedTags: [],
        sortableInstance: null,
        lastActiveInput: 'main',
        
        isDragging: false,
        dragPosition: 0,
        dragTimeDisplay: '',
        draggingHabitId: null,
        dragStartY: 0,
        touchStartTime: 0,
        
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
        
        streak: 0,
        weeklyRate: 0,
        dailyStats: {
            today: { completed: 0, total: 0, rate: 0 },
            yesterday: { completed: 0, total: 0, rate: 0 },
            week: { completed: 0, total: 0, rate: 0 },
            allTime: { completed: 0, total: 0, rate: 0 }
        },
        summaryStats: { vsYesterday: 0, vsWeek: 0 },
        
        timeSlots: [],
        currentTimePosition: 0,
        timelineHeight: 800,
        viewportHeight: 0,
        scrollTop: 0,
        visibleRange: { start: 0, end: 0 },
        
        updateTimer: null,
        resizeObserver: null,
        hammerInstance: null,
        
        getDefaultDailyStats() {
            return {
                today: { completed: 0, total: 0, rate: 0 },
                yesterday: { completed: 0, total: 0, rate: 0 },
                week: { completed: 0, total: 0, rate: 0 },
                allTime: { completed: 0, total: 0, rate: 0 }
            };
        },
        
        getDefaultForm() {
            return {
                title: '',
                description: '',
                time: '09:00',
                duration: 30,
                tags: [],
                subHabits: [],
                isDynamic: false,
                offsetMinutes: 60
            };
        },
        
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
        
        get visibleTimeSlots() {
            return this.timeSlots || [];
        },
        
        get visibleHabits() {
            const habitsToShow = this.selectedTags.length > 0 ? this.filteredHabits : this.habits;
            if (!habitsToShow.length) return [];
            
            const buffer = 100;
            return habitsToShow.filter(habit => 
                !habit.hidden &&
                habit.position >= this.visibleRange.start - buffer && 
                habit.position <= this.visibleRange.end + buffer
            );
        },

        getCurrentTime() {
            return TimeUtils.getCurrentTime();
        },

        getTimeAgo() {
            const wakeTime = dayjs(this.wakeUpTime, 'HH:mm');
            const now = dayjs();
            const minutesSinceWake = now.diff(wakeTime, 'minute');
            
            if (minutesSinceWake < 0) return "not yet";
            if (minutesSinceWake === 0) return "just now";
            
            const duration = dayjs.duration(minutesSinceWake, 'minutes');
            const hours = Math.floor(duration.asHours());
            const mins = duration.minutes();
            
            return hours > 0 ? `${hours}h ${mins}m ago` : `${mins}m ago`;
        },

        calculateTimeFromPosition(position) {
            const timeline = TimelineCalculator.positionToTime(position, this.timeSlots, this.wakeUpTime);
            return timeline.timeStr;
        },

        handleTouchStart(event) {
            if (event.target.closest('.drag-handle')) {
                const habitId = event.target.closest('.drag-handle').dataset.habitId;
                this.touchStartTime = Date.now();
                this.handleDragStart(habitId, event.touches[0].clientY);
            }
        },

        handleTouchMove(event) {
            if (this.isDragging) {
                event.preventDefault();
                this.handleDragMove(event.touches[0].clientY);
            }
        },

        handleTouchEnd(event) {
            if (this.isDragging) {
                this.handleDragEnd();
            }
        },

        handleMouseDown(event) {
            if (event.target.closest('.drag-handle')) {
                const habitId = event.target.closest('.drag-handle').dataset.habitId;
                this.handleDragStart(habitId, event.clientY);
            }
        },

        handleMouseMove(event) {
            if (this.isDragging) {
                this.handleDragMove(event.clientY);
            }
        },

        handleMouseUp(event) {
            if (this.isDragging) {
                this.handleDragEnd();
            }
        },

        handleDragStart(habitId, clientY) {
            this.isDragging = true;
            this.draggingHabitId = habitId;
            this.dragStartY = clientY;
            document.body.classList.add('dragging');
            
            const habit = this.habits.find(h => h.id === habitId);
            if (habit) {
                this.dragPosition = habit.position;
            }
        },

        handleDragMove(clientY) {
            if (!this.isDragging) return;
            
            const timeline = this.$refs.timeline;
            const rect = timeline.getBoundingClientRect();
            const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
            const relativeY = clientY + scrollTop - rect.top - scrollTop;
            
            this.dragPosition = Math.max(0, Math.min(this.timelineHeight, relativeY));
            
            const time = this.calculateTimeFromPosition(this.dragPosition);
            if (time) {
                this.dragTimeDisplay = TimeUtils.formatTime(time, true);
            }
            
            if (clientY < 100) {
                window.scrollBy(0, -10);
            } else if (clientY > window.innerHeight - 100) {
                window.scrollBy(0, 10);
            }
        },

        handleDragEnd() {
            if (!this.isDragging || !this.draggingHabitId) return;
            
            const rawTime = this.calculateTimeFromPosition(this.dragPosition);
            
            if (rawTime) {
                const habit = this.habits.find(h => h.id === this.draggingHabitId);
                if (habit) {
                    let minutesSinceWake = TimeUtils.getMinutesSinceWake(rawTime, this.wakeUpTime);
                    minutesSinceWake = Math.max(1, Math.min(1439, minutesSinceWake));
                    
                    const clampedTime = TimeUtils.addMinutesToTime(this.wakeUpTime, minutesSinceWake);
                    
                    if (habit.isDynamic) {
                        habit.offsetMinutes = minutesSinceWake;
                        habit.effectiveTime = clampedTime;
                    } else {
                        habit.time = clampedTime;
                        habit.effectiveTime = clampedTime;
                    }
                    
                    this.updateHighlighting();
                    this.sortByTime();
                    this.rebuildTimeline();
                    this.saveData();
                }
            }
            
            document.body.classList.remove('dragging');
            this.isDragging = false;
            this.dragPosition = 0;
            this.dragTimeDisplay = '';
            this.draggingHabitId = null;
        },

        handleViewportScroll() {
            this.updateVisibleRange();
        },

        updateVisibleRange() {
            const timeline = this.$refs.timeline;
            if (!timeline) return;
            
            const rect = timeline.getBoundingClientRect();
            const windowHeight = window.innerHeight;
            const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
            
            const visibleTop = Math.max(0, -rect.top);
            const visibleBottom = visibleTop + windowHeight;
            
            this.visibleRange = {
                start: visibleTop,
                end: visibleBottom
            };
        },

        async init() {
            try {
                this.resetModalStates();
                this.wakeUpTime = this.getCurrentTime();
                
                await this.loadData();
                this.calculateAnalytics();
                this.updateTimeline();
                this.updateHighlighting();
                await Notifications.request();
                
                this.setupWatchers();
                this.setupTimers();
                
                this.$nextTick(() => {
                    this.setupResponsiveHandlers();
                    this.setupDragDrop();
                    this.updateVisibleRange();
                    this.scrollToCurrentTime();
                    
                    window.addEventListener('scroll', () => {
                        this.updateVisibleRange();
                    });
                });
                
            } catch (error) {
                console.error('Init error:', error);
                this.habits = [];
                this.isAwake = false;
            }
        },

        resetModalStates() {
            this.showModal = false;
            this.showAnalytics = false;
            this.showSummary = false;
            this.showMarkdownHelp = false;
        },

        setupWatchers() {
            this.$watch('selectedTags', () => {
                if (this.isAwake) {
                    this.$nextTick(() => {
                        this.updateTimeline();
                        this.scrollToCurrentTime();
                    });
                }
            }, { deep: true });
            
            this.$watch('isAwake', () => {
                if (this.isAwake) {
                    this.$nextTick(() => {
                        this.updateTimeline();
                        this.scrollToCurrentTime();
                    });
                }
            });
        },

        setupTimers() {
            this.updateTimer = setInterval(() => {
                // Check if current wake day has expired (24 hours passed)
                if (this.currentWakeDayKey && this.isAwake) {
                    if (TimeUtils.isWakeDayExpired(this.currentWakeDayKey)) {
                        // Auto-complete only during background/inactive usage
                        if (document.hidden || !document.hasFocus()) {
                            this.autoCompleteCurrentDay();
                        }
                    }
                }
                
                this.updateHighlighting();
                this.updateCurrentTimePosition();
                
                if (!this.isAwake) {
                    this.wakeUpTime = this.getCurrentTime();
                }
            }, 60000);
        },

        async loadData() {
            try {
                const data = await Storage.load();
                
                if (!data.days || Object.keys(data.days).length === 0) {
                    // No days exist, show not awake screen
                    this.isAwake = false;
                    this.currentWakeDayKey = null;
                    this.habits = [];
                    return;
                }
                
                // Auto-complete expired days (only on startup)
                const updatedDays = TimeUtils.completeExpiredDays(data.days, async (days) => {
                    data.days = days;
                    await Storage.save(data);
                });
                data.days = updatedDays;
                
                // Find most recent uncompleted day
                const mostRecent = TimeUtils.getMostRecentUncompletedWakeDay(data.days);
                
                if (!mostRecent) {
                    // All days are completed
                    this.isAwake = false;
                    this.currentWakeDayKey = null;
                    this.habits = [];
                    return;
                }
                
                // Check if the most recent uncompleted day is expired
                if (TimeUtils.isWakeDayExpired(mostRecent.key)) {
                    // Auto-complete it
                    data.days[mostRecent.key] = {
                        ...mostRecent.day,
                        isCompleted: true,
                        completedAt: new Date().toISOString(),
                        autoCompleted: true
                    };
                    await Storage.save(data);
                    
                    this.isAwake = false;
                    this.currentWakeDayKey = null;
                    this.habits = [];
                    return;
                }
                
                // Load the most recent uncompleted day
                this.currentWakeDayKey = mostRecent.key;
                const currentDay = mostRecent.day;
                
                this.isAwake = true;
                this.wakeUpTime = currentDay.wakeTime;
                this.currentDate = currentDay.date;
                
                // Load habits with their completion status
                this.habits = currentDay.habits.map(habit => ({
                    ...habit,
                    expanded: false,
                    effectiveTime: this.calculateEffectiveTime(habit)
                }));
                
                this.sortByTime();
                this.updateTimeline();
            } catch (error) {
                console.error('Load data error:', error);
                this.habits = [];
                this.isAwake = false;
                this.currentWakeDayKey = null;
            }
        },

        calculateEffectiveTime(habit) {
            if (habit.isDynamic) {
                return TimeUtils.addMinutesToTime(this.wakeUpTime, habit.offsetMinutes || 0);
            }
            return habit.effectiveTime || habit.time;
        },

        async saveData() {
            try {
                console.log('saveData called');
                const data = await Storage.load();
                
                if (!data.days) data.days = {};
                
                if (this.currentWakeDayKey && this.isAwake) {
                    // Update current day data
                    data.days[this.currentWakeDayKey] = {
                        date: this.currentDate,
                        wakeTime: this.wakeUpTime,
                        isCompleted: false,
                        habits: this.habits.map(h => ({
                            id: h.id,
                            title: h.title,
                            description: h.description,
                            time: h.time,
                            effectiveTime: h.effectiveTime,
                            duration: h.duration,
                            tags: h.tags || [],
                            isDynamic: h.isDynamic || false,
                            offsetMinutes: h.offsetMinutes || 0,
                            completed: h.completed,
                            subHabits: (h.subHabits || []).map(s => ({ 
                                id: s.id, 
                                title: s.title,
                                description: s.description || '',
                                completed: s.completed
                            }))
                        })),
                        stats: this.calculateCurrentStats(),
                        completedAt: null
                    };
                    
                    // Check data size
                    const dataSize = JSON.stringify(data).length;
                    console.log(`Data size: ${dataSize} bytes (${(dataSize / 1024 / 1024).toFixed(2)} MB)`);
                    
                    if (dataSize > 4 * 1024 * 1024) { // Warn if over 4MB
                        console.warn('Data size is large and may approach localStorage limits');
                    }
                }
                
                const saveResult = await Storage.save(data);
                if (!saveResult) {
                    console.error('saveData: Storage.save returned false');
                }
            } catch (error) {
                console.error('Save data error:', error);
                console.error('Error stack:', error.stack);
            }
        },

        calculateCurrentStats() {
            const total = this.habits.length;
            const completed = this.completedCount;
            
            return {
                total,
                completed,
                rate: total > 0 ? Math.round((completed / total) * 100) : 0
            };
        },

        async autoCompleteCurrentDay() {
            if (!this.currentWakeDayKey) return;
            
            try {
                const data = await Storage.load();
                
                if (data.days && data.days[this.currentWakeDayKey]) {
                    // Update stats before completing
                    data.days[this.currentWakeDayKey].stats = this.calculateCurrentStats();
                    
                    // Mark as completed
                    data.days[this.currentWakeDayKey].isCompleted = true;
                    data.days[this.currentWakeDayKey].completedAt = new Date().toISOString();
                    data.days[this.currentWakeDayKey].autoCompleted = true;
                    
                    await Storage.save(data);
                }
                
                // Reset to not awake state
                this.isAwake = false;
                this.currentWakeDayKey = null;
                this.habits = [];
                this.wakeUpTime = this.getCurrentTime();
            } catch (error) {
                console.error('Auto-complete error:', error);
            }
        },

        rebuildTimeline() {
            this.$nextTick(() => {
                this.updateTimeline();
            });
        },

        updateTimeline() {
            try {
                if (!this.isAwake) {
                    this.timeSlots = [];
                    this.timelineHeight = 800;
                    return;
                }
                
                const habitsForTimeline = this.selectedTags.length > 0 ? this.filteredHabits : this.habits;
                const timeline = TimelineCalculator.generateTimeline(habitsForTimeline, this.wakeUpTime);
                
                this.timeSlots = [...timeline.slots];
                this.timelineHeight = timeline.height;
                
                this.habits.forEach(habit => {
                    const isVisible = this.selectedTags.length === 0 || 
                                    (habit.tags && habit.tags.some(tag => this.selectedTags.includes(tag)));
                    
                    if (isVisible) {
                        const position = TimelineCalculator.timeToPosition(
                            habit.effectiveTime,
                            this.timeSlots,
                            this.wakeUpTime
                        );
                        habit.position = position;
                        habit.hidden = false;
                    } else {
                        habit.hidden = true;
                        habit.position = -1000;
                    }
                });
                
                this.updateCurrentTimePosition();
                
                this.$nextTick(() => {
                    this.setupDragDrop();
                    this.updateVisibleRange();
                });
            } catch (error) {
                console.error('Update timeline error:', error);
                this.timeSlots = [];
                this.timelineHeight = 800;
            }
        },

        updateCurrentTimePosition() {
            try {
                const position = TimelineCalculator.timeToPosition(
                    this.getCurrentTime(),
                    this.timeSlots,
                    this.wakeUpTime
                );
                this.currentTimePosition = position;
            } catch (error) {
                console.error('Update current time position error:', error);
                this.currentTimePosition = 100;
            }
        },

        scrollToCurrentTime() {
            const timeline = this.$refs.timeline;
            if (!timeline) return;
            
            const rect = timeline.getBoundingClientRect();
            const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
            const timelineTop = rect.top + scrollTop;
            const targetScroll = timelineTop + this.currentTimePosition - window.innerHeight / 2;
            
            window.scrollTo({
                top: Math.max(0, targetScroll),
                behavior: 'smooth'
            });
        },

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
		
        toggleExpanded(habit) {
            if (!habit) return;
            
            // If this habit is being expanded, collapse all others first
            if (!habit.expanded) {
                this.habits.forEach(h => {
                    if (h.id !== habit.id) {
                        h.expanded = false;
                    }
                });
            }
            
            habit.expanded = !habit.expanded;
        },

        editHabit(habit) {
            if (!habit) return;
            
            this.editingHabit = null;
            this.showModal = false;
            
            this.$nextTick(() => {
                if (habit.isDynamic) {
                    habit.effectiveTime = TimeUtils.addMinutesToTime(this.wakeUpTime, habit.offsetMinutes || 0);
                }
                
                this.editingHabit = habit;
                this.form = {
                    title: habit.title || '',
                    description: habit.description || '',
                    time: habit.time || habit.effectiveTime || '09:00',
                    duration: habit.duration || 30,
                    tags: Array.isArray(habit.tags) ? [...habit.tags] : [],
                    subHabits: Array.isArray(habit.subHabits) ? habit.subHabits.map(s => ({ 
                        id: s.id,
                        title: s.title,
                        description: s.description || '',
                        completed: s.completed
                    })) : [],
                    isDynamic: habit.isDynamic || false,
                    offsetMinutes: habit.offsetMinutes || 60
                };
                
                this.showModal = true;
                this.lastActiveInput = 'main';
            });
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
                const habitData = this.createHabitData();
                
                if (this.editingHabit) {
                    const index = this.habits.findIndex(h => h.id === this.editingHabit.id);
                    if (index >= 0) {
                        // Preserve completed status for the habit
                        habitData.completed = this.habits[index].completed;
                        
                        // Preserve completed status for existing sub-habits
                        const existingHabit = this.habits[index];
                        habitData.subHabits = habitData.subHabits.map(subHabit => {
                            const existingSub = existingHabit.subHabits?.find(s => s.id === subHabit.id);
                            if (existingSub) {
                                return { ...subHabit, completed: existingSub.completed };
                            }
                            return subHabit;
                        });
                        
                        this.habits[index] = { ...this.habits[index], ...habitData };
                    }
                } else {
                    this.habits.push(habitData);
                }
                
                this.closeModal();
                this.updateHighlighting();
                this.updateAfterChange();
            } catch (error) {
                console.error('Save habit error:', error);
            }
        },

        createHabitData() {
            const habitData = {
                id: this.editingHabit?.id || Utils.generateId(),
                title: Utils.sanitize(this.form.title),
                description: this.form.description || '',
                time: this.form.time || '09:00',
                duration: parseInt(this.form.duration) || 30,
                tags: Array.isArray(this.form.tags) ? this.form.tags.filter(Boolean) : [],
                isDynamic: this.form.isDynamic || false,
                offsetMinutes: parseInt(this.form.offsetMinutes) || 0,
                subHabits: this.processSubHabits(),
                completed: false,
                expanded: false
            };
            
            if (habitData.isDynamic) {
                habitData.offsetMinutes = Math.max(1, Math.min(1439, habitData.offsetMinutes));
                habitData.effectiveTime = TimeUtils.addMinutesToTime(this.wakeUpTime, habitData.offsetMinutes);
            } else {
                let minutesSinceWake = TimeUtils.getMinutesSinceWake(habitData.time, this.wakeUpTime);
                minutesSinceWake = Math.max(1, Math.min(1439, minutesSinceWake));
                habitData.effectiveTime = TimeUtils.addMinutesToTime(this.wakeUpTime, minutesSinceWake);
                habitData.time = habitData.effectiveTime;
            }
            
            return habitData;
        },

        processSubHabits() {
            if (!Array.isArray(this.form.subHabits)) return [];
            
            return this.form.subHabits.filter(s => s?.title?.trim()).map(s => ({
                id: s.id || Utils.generateId(),
                title: Utils.sanitize(s.title),
                description: s.description || '',
                completed: s.completed || false
            }));
        },

        updateAfterChange() {
            this.sortByTime();
            this.updateHighlighting();
            this.rebuildTimeline();
            this.calculateAnalytics();
            this.saveData().catch(error => {
                console.error('Error saving data:', error);
            });
        },

        updateHighlighting() {
            try {
                const currentMinutesSinceWake = TimeUtils.getMinutesSinceWake(this.getCurrentTime(), this.wakeUpTime);
                let nextHabit = null;
                let minDiff = Infinity;
                
                this.habits.forEach(habit => {
                    if (!habit.effectiveTime) return;
                    
                    const minutesSinceWake = TimeUtils.getMinutesSinceWake(habit.effectiveTime, this.wakeUpTime);
                    const warningMinutes = Math.max(10, habit.duration || 30);
                    
                    habit.isOverdue = !habit.completed && currentMinutesSinceWake > minutesSinceWake;
                    habit.isCurrent = false;
                    
                    if (!habit.completed) {
                        if (currentMinutesSinceWake > minutesSinceWake) {
                            habit.bgColor = 'rgb(254, 226, 226)';
                        } else if (currentMinutesSinceWake >= minutesSinceWake - warningMinutes) {
                            const progress = (currentMinutesSinceWake - (minutesSinceWake - warningMinutes)) / warningMinutes;
                            const red = Math.round(220 + (254 - 220) * progress);
                            const green = Math.round(252 - (252 - 226) * progress);
                            const blue = Math.round(231 - (231 - 226) * progress);
                            habit.bgColor = `rgb(${red}, ${green}, ${blue})`;
                        } else {
                            habit.bgColor = 'rgb(255, 255, 255)';
                            const diff = minutesSinceWake - currentMinutesSinceWake;
                            if (diff < minDiff) {
                                minDiff = diff;
                                nextHabit = habit;
                            }
                        }
                    } else {
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

        setupDragDrop() {
            try {
                const container = document.getElementById('habits-container');
                if (!container || typeof Sortable === 'undefined') return;
                
                if (this.sortableInstance) {
                    this.sortableInstance.destroy();
                }
                
                this.sortableInstance = Sortable.create(container, {
                    handle: '.drag-handle',
                    animation: 0,
                    disabled: true,
                    forceFallback: true
                });
            } catch (error) {
                console.error('Setup drag drop error:', error);
            }
        },

        setupResponsiveHandlers() {
            if (this.resizeObserver) {
                this.resizeObserver.disconnect();
            }
            
            this.resizeObserver = new ResizeObserver(entries => {
                this.updateVisibleRange();
            });
            
            const timeline = this.$refs.timeline;
            if (timeline) {
                this.resizeObserver.observe(timeline);
            }
            
            if (this.hammerInstance) {
                this.hammerInstance.destroy();
            }
            
            if (timeline && typeof Hammer !== 'undefined') {
                this.hammerInstance = new Hammer(timeline);
                this.hammerInstance.get('pan').set({ direction: Hammer.DIRECTION_VERTICAL });
                
                this.hammerInstance.on('panstart', (ev) => {
                    if (ev.target.closest('.drag-handle')) {
                        const habitId = ev.target.closest('.drag-handle').dataset.habitId;
                        this.handleDragStart(habitId, ev.center.y);
                    }
                });
                
                this.hammerInstance.on('panmove', (ev) => {
                    if (this.isDragging) {
                        this.handleDragMove(ev.center.y);
                    }
                });
                
                this.hammerInstance.on('panend', () => {
                    if (this.isDragging) {
                        this.handleDragEnd();
                    }
                });
            }
        },

        closeModal() {
            this.showModal = false;
            this.showMarkdownHelp = false;
            this.editingHabit = null;
            this.form = this.getDefaultForm();
            this.tagInput = '';
            this.lastActiveInput = 'main';
        },

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

        clearTagFilters() {
            this.selectedTags = [];
        },

        addSubHabit() {
            if (!this.form.subHabits) this.form.subHabits = [];
            this.form.subHabits.push({ id: Utils.generateId(), title: '', description: '', completed: false });
        },

        async wakeUp() {
            this.isAwake = true;
            this.wakeUpTime = this.getCurrentTime();
            this.currentDate = TimeUtils.getDateKey();
            
            // Create new wake day key
            this.currentWakeDayKey = TimeUtils.getWakeDayKey(this.wakeUpTime, this.currentDate);
            
            // Load data to get most recent day's habits as templates
            const data = await Storage.load();
            
            // Find the most recent day (completed or not) to use as template
            let templateHabits = [];
            if (data.days && Object.keys(data.days).length > 0) {
                const sortedDays = Object.entries(data.days)
                    .map(([key, day]) => ({ key, day }))
                    .sort((a, b) => {
                        const dateA = new Date(`${a.day.date}T${a.day.wakeTime}:00`);
                        const dateB = new Date(`${b.day.date}T${b.day.wakeTime}:00`);
                        return dateB - dateA;
                    });
                
                if (sortedDays.length > 0) {
                    templateHabits = sortedDays[0].day.habits.map(habit => ({
                        ...habit,
                        completed: false,
                        subHabits: (habit.subHabits || []).map(sub => ({
                            ...sub,
                            completed: false
                        }))
                    }));
                }
            }
            
            // Create new habits from templates
            this.habits = templateHabits.map(template => ({
                ...template,
                effectiveTime: this.calculateEffectiveTime(template),
                expanded: false
            }));
            
            // Save new day
            if (!data.days) data.days = {};
            data.days[this.currentWakeDayKey] = {
                date: this.currentDate,
                wakeTime: this.wakeUpTime,
                isCompleted: false,
                habits: this.habits,
                stats: this.calculateCurrentStats(),
                completedAt: null
            };
            
            await Storage.save(data);
            
            this.sortByTime();
            this.updateTimeline();
            Notifications.scheduleAllHabits(this.habits, this.wakeUpTime);
        },

        endDay() {
            this.calculateSummaryStats();
            this.showSummary = true;
        },

        async goToSleep() {
            console.log("goToSleep called");
            if (!this.currentWakeDayKey) {
                console.log("No currentWakeDayKey, returning");
                return;
            }
            
            try {
                console.log("Loading data...");
                const data = await Storage.load();
                console.log("Data loaded:", data);
                
                if (data.days && data.days[this.currentWakeDayKey]) {
                    console.log("Updating day data for key:", this.currentWakeDayKey);
                    
                    // Update final stats
                    data.days[this.currentWakeDayKey].stats = this.calculateCurrentStats();
                    
                    // Mark as completed
                    data.days[this.currentWakeDayKey].isCompleted = true;
                    data.days[this.currentWakeDayKey].completedAt = new Date().toISOString();
                    
                    // Save updated habits state
                    data.days[this.currentWakeDayKey].habits = this.habits.map(h => ({
                        id: h.id,
                        title: h.title,
                        description: h.description,
                        time: h.time,
                        effectiveTime: h.effectiveTime,
                        duration: h.duration,
                        tags: h.tags || [],
                        isDynamic: h.isDynamic || false,
                        offsetMinutes: h.offsetMinutes || 0,
                        completed: h.completed,
                        subHabits: (h.subHabits || []).map(s => ({ 
                            id: s.id, 
                            title: s.title,
                            description: s.description || '',
                            completed: s.completed
                        }))
                    }));
                    
                    console.log("Attempting to save data...");
                    console.log("Data size:", JSON.stringify(data).length, "bytes");
                    
                    const saveResult = await Storage.save(data);
                    console.log("Save result:", saveResult);
                    
                    if (!saveResult) {
                        console.error("Storage.save returned false - save may have failed");
                        // Try to save to localStorage directly as fallback
                        try {
                            localStorage.setItem('habitTracker', JSON.stringify({
                                ...data,
                                updatedAt: new Date().toISOString()
                            }));
                            console.log("Fallback localStorage save succeeded");
                        } catch (fallbackError) {
                            console.error("Fallback save also failed:", fallbackError);
                            alert("Failed to save data. Your progress may not be saved.");
                        }
                    }
                } else {
                    console.log("No day data found for key:", this.currentWakeDayKey);
                }
                
                console.log("Resetting state...");
                // Reset state
                this.isAwake = false;
                this.showSummary = false;
                this.currentWakeDayKey = null;
                this.habits = [];
                this.wakeUpTime = this.getCurrentTime();
                console.log("goToSleep completed successfully");
            } catch (error) {
                console.error('Go to sleep error:', error);
                console.error('Error stack:', error.stack);
                alert("An error occurred while saving. Please check the console.");
            }
        },

        async saveHistory() {
            // Deprecated - history is now part of days structure
            console.log('saveHistory called but deprecated');
        },

        calculateAnalytics() {
            try {
                this.$nextTick(async () => {
                    const data = await Storage.load();
                    this.streak = Analytics.calculateStreak(data.days || {});
                    this.weeklyRate = Analytics.calculateWeeklyRate(data.days || {});
                    this.dailyStats = Analytics.calculateDailyStats(data.days) || this.getDefaultDailyStats();
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

        sortByTime() {
            try {
                this.habits.sort((a, b) => {
                    const aMinutes = TimeUtils.getMinutesSinceWake(a.effectiveTime, this.wakeUpTime);
                    const bMinutes = TimeUtils.getMinutesSinceWake(b.effectiveTime, this.wakeUpTime);
                    return aMinutes - bMinutes;
                });
            } catch (error) {
                console.error('Sort by time error:', error);
            }
        },

        formatTime(timeStr) {
            return TimeUtils.formatTime(timeStr, true);
        },

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
            if (url.match(/\.(mp4|webm|ogg)$/i)) {
                return `<div class="video-embed generic-embed">
                          <video width="100%" height="auto" controls preload="metadata">
                            <source src="${url}" type="video/${url.split('.').pop()}">
                            Your browser does not support the video tag.
                          </video>
                        </div>`;
            }
            return `<a href="${url}" target="_blank" rel="noopener noreferrer" class="text-blue-600 hover:text-blue-800 underline">${url}</a>`;
        },
        
        clearAllData() {
            if (confirm('Are you sure you want to delete ALL data? This cannot be undone!')) {
                if (confirm('Really sure? All habits, history, and settings will be permanently deleted.')) {
                    try {
                        localStorage.clear();
                        
                        this.habits = [];
                        this.selectedTags = [];
                        this.isAwake = false;
                        this.wakeUpTime = this.getCurrentTime();
                        this.currentDate = TimeUtils.getDateKey();
                        this.currentWakeDayKey = null;
                        this.streak = 0;
                        this.weeklyRate = 0;
                        this.dailyStats = this.getDefaultDailyStats();
                        
                        this.updateTimeline();
                        
                        alert('All data has been cleared. The app has been reset to factory settings.');
                    } catch (error) {
                        console.error('Error clearing data:', error);
                        alert('Error clearing data. Please check the console.');
                    }
                }
            }
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
            
            let cursorOffset = before.length;
            let insertText = before + selectedText + after;
            
            if (before === '**' && after === '**') {
                if (!selectedText) {
                    cursorOffset = before.length;
                }
            } else if (before === '*' && after === '*') {
                if (!selectedText) {
                    cursorOffset = before.length;
                }
            } else if (before === '__' && after === '__') {
                if (!selectedText) {
                    cursorOffset = before.length;
                }
            } else if (before === '# ' && after === '') {
                cursorOffset = before.length;
            } else if (before.includes('[title]')) {
                cursorOffset = before.length + 1;
            }
            
            const newText = text.substring(0, start) + insertText + text.substring(end);
            
            if (this.lastActiveInput === 'main') {
                this.form.description = newText;
            } else if (this.lastActiveInput.startsWith('sub')) {
                const index = parseInt(this.lastActiveInput.substring(3));
                this.form.subHabits[index].description = newText;
            }
            
            this.$nextTick(() => {
                targetInput.focus();
                const newCursorPos = start + cursorOffset;
                targetInput.setSelectionRange(newCursorPos, newCursorPos);
            });
        }
    }));
});