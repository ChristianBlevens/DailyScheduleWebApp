dayjs.extend(window.dayjs_plugin_customParseFormat);
dayjs.extend(window.dayjs_plugin_duration);

document.addEventListener('alpine:init', () => {
    Alpine.data('habitTracker', () => ({
        habits: [],
        currentDate: TimeUtils.getDateKey(),
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
        summaryStats: {
            vsYesterday: 0,
            vsWeek: 0
        },
        
        timeSlots: [],
        currentTimePosition: 0,
        timelineHeight: 800,
        viewportHeight: 0,
        scrollTop: 0,
        visibleRange: { start: 0, end: 0 },
        
        updateTimer: null,
        resizeObserver: null,
        hammerInstance: null,
        
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
            if (!this.timeSlots.length) return [];
            const buffer = 50;
            const visible = this.timeSlots.filter(slot => 
                slot.position >= this.visibleRange.start - buffer && 
                slot.position <= this.visibleRange.end + buffer
            );

            return visible;
        },
        
        get visibleHabits() {
            if (!this.filteredHabits.length) return [];
            const buffer = 100;
            return this.filteredHabits.filter(habit => 
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
            
            if (hours > 0) {
                return `${hours}h ${mins}m ago`;
            } else {
                return `${mins}m ago`;
            }
        },

        calculateTimeFromPosition(position) {
            const timeline = TimelineCalculator.positionToTime(
                position, 
                this.timeSlots, 
                this.wakeUpTime
            );
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
            
            const viewport = this.$refs.viewport;
            const rect = viewport.getBoundingClientRect();
            const relativeY = clientY - rect.top + viewport.scrollTop;
            
            this.dragPosition = Math.max(0, Math.min(this.timelineHeight, relativeY));
            
            const time = this.calculateTimeFromPosition(this.dragPosition);
            if (time) {
                this.dragTimeDisplay = TimeUtils.formatTime(time, true);
            }
            
            if (clientY < rect.top + 50) {
                viewport.scrollTop = Math.max(0, viewport.scrollTop - 10);
            } else if (clientY > rect.bottom - 50) {
                viewport.scrollTop = Math.min(
                    viewport.scrollHeight - viewport.clientHeight,
                    viewport.scrollTop + 10
                );
            }
        },

        handleDragEnd() {
            if (!this.isDragging || !this.draggingHabitId) return;
            
            const newTime = this.calculateTimeFromPosition(this.dragPosition);
            
            if (newTime) {
                const habit = this.habits.find(h => h.id === this.draggingHabitId);
                if (habit) {
                    if (habit.isDynamic) {
                        const offsetMinutes = TimeUtils.getMinutesBetween(this.wakeUpTime, newTime);
                        habit.offsetMinutes = Math.max(0, offsetMinutes);
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
        },

        handleViewportScroll() {
            const viewport = this.$refs.viewport;
            this.scrollTop = viewport.scrollTop;
            this.updateVisibleRange();
        },

        updateVisibleRange() {
            const viewport = this.$refs.viewport;
            if (!viewport) return;
            
            this.viewportHeight = viewport.clientHeight;
            this.visibleRange = {
                start: this.scrollTop,
                end: this.scrollTop + this.viewportHeight
            };
        },

        async init() {
            try {
                this.wakeUpTime = this.getCurrentTime();
                
                await this.loadData();
                this.calculateAnalytics();
                this.updateTimeline();
                this.updateHighlighting();
                await Notifications.request();
                
                this.updateTimer = setInterval(() => {
                    const newDate = TimeUtils.getDateKey();
                    if (newDate !== this.currentDate) {
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
                    this.setupResponsiveHandlers();
                    this.setupDragDrop();
                    this.updateVisibleRange();
                    this.scrollToCurrentTime();
                });
                
            } catch (error) {
                console.error('Init error:', error);
                this.habits = [];
                this.isAwake = false;
            }
        },

        async loadData() {
            try {
                const data = await Storage.load();
                const today = this.currentDate;
                
                this.isAwake = data.awake?.[today] === true;
                this.wakeUpTime = data.wakeUpTimes?.[today] || this.getCurrentTime();
                
                this.habits = (data.templates || []).map(template => {
                    const effectiveTime = template.isDynamic 
                        ? TimeUtils.addMinutesToTime(this.wakeUpTime, template.offsetMinutes || 0)
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

        updateTimeline() {
            try {
                if (!this.isAwake) {
                    this.timeSlots = [];
                    this.timelineHeight = 800;
                    return;
                }
                
                const timeline = TimelineCalculator.generateTimeline(
                    this.habits,
                    this.wakeUpTime
                );
                
                this.timeSlots = timeline.slots;
                this.timelineHeight = timeline.height;
                
                this.habits.forEach(habit => {
                    const position = TimelineCalculator.timeToPosition(
                        habit.effectiveTime,
                        this.timeSlots,
                        this.wakeUpTime
                    );
                    habit.position = position;
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
            const viewport = this.$refs.viewport;
            if (!viewport) return;
            
            const targetScroll = Math.max(0, this.currentTimePosition - viewport.clientHeight / 2);
            viewport.scrollTop = targetScroll;
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

        editHabit(habit) {
            if (!habit) return;
            
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
                    description: this.form.description || '',
                    time: this.form.time || '09:00',
                    duration: parseInt(this.form.duration) || 30,
                    tags: Array.isArray(this.form.tags) ? this.form.tags.filter(Boolean) : [],
                    isDynamic: this.form.isDynamic || false,
                    offsetMinutes: parseInt(this.form.offsetMinutes) || 0,
                    subHabits: Array.isArray(this.form.subHabits) ? 
                        this.form.subHabits.filter(s => s?.title?.trim()).map(s => ({
                            id: s.id || Utils.generateId(),
                            title: Utils.sanitize(s.title),
                            description: s.description || '',
                            completed: false
                        })) : [],
                    completed: false,
                    expanded: false
                };
                
                habitData.effectiveTime = habitData.isDynamic 
                    ? TimeUtils.addMinutesToTime(this.wakeUpTime, habitData.offsetMinutes)
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

        updateAfterChange() {
            this.sortByTime();
            this.updateTimeline();
            this.calculateAnalytics();
            this.updateHighlighting();
            this.saveData().catch(error => {
                console.error('Error saving data:', error);
            });
        },

        updateHighlighting() {
            try {
                const currentMinutes = TimeUtils.timeToMinutes(this.getCurrentTime());
                const wakeMinutes = TimeUtils.timeToMinutes(this.wakeUpTime);
                
                let nextHabit = null;
                let minDiff = Infinity;
                
                this.habits.forEach(habit => {
                    if (!habit.effectiveTime) return;
                    
                    const habitMinutes = TimeUtils.timeToMinutes(habit.effectiveTime);
                    const minutesSinceWake = TimeUtils.getMinutesSinceWake(habit.effectiveTime, this.wakeUpTime);
                    const currentMinutesSinceWake = TimeUtils.getMinutesSinceWake(this.getCurrentTime(), this.wakeUpTime);
                    
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
            
            const viewport = this.$refs.viewport;
            if (viewport) {
                this.resizeObserver.observe(viewport);
            }
            
            if (this.hammerInstance) {
                this.hammerInstance.destroy();
            }
            
            const timeline = this.$refs.timeline;
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

        async wakeUp() {
            this.isAwake = true;
            this.wakeUpTime = this.getCurrentTime();
            
            await this.saveData();
            await this.loadData();
            
            Notifications.scheduleAllHabits(this.habits, this.wakeUpTime);
            
            this.$nextTick(() => {
                this.scrollToCurrentTime();
            });
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
            } else if (before.includes('[blank]')) {
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

console.log('Habit Tracker loaded');