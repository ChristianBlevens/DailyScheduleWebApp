const TimeUtils = {
    timeToMinutes(timeStr) {
        if (!timeStr || typeof timeStr !== 'string') return 0;
        const [hours, minutes] = timeStr.split(':').map(n => parseInt(n) || 0);
        return hours * 60 + minutes;
    },
    
    minutesToTime(minutes) {
        if (typeof minutes !== 'number' || isNaN(minutes)) return '00:00';
        const normalizedMinutes = ((minutes % 1440) + 1440) % 1440;
        const hours = Math.floor(normalizedMinutes / 60);
        const mins = normalizedMinutes % 60;
        return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`;
    },
    
    getCurrentTime() {
        const now = new Date();
        return `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
    },
    
    getCurrentMinutes() {
        const now = new Date();
        return now.getHours() * 60 + now.getMinutes();
    },
    
    getDateKey(date = new Date()) {
        return date.toISOString().split('T')[0];
    },
    
    // New wake-based day functions
    getWakeDayKey(wakeTime, wakeDate = new Date()) {
        const dateStr = typeof wakeDate === 'string' ? wakeDate : this.getDateKey(wakeDate);
        return `${dateStr}_${wakeTime}`;
    },
    
    parseWakeDayKey(wakeDayKey) {
        try {
            if (!wakeDayKey || typeof wakeDayKey !== 'string') {
                throw new Error('Invalid wake day key');
            }
            
            const parts = wakeDayKey.split('_');
            if (parts.length !== 2) {
                throw new Error('Malformed wake day key');
            }
            
            const [date, time] = parts;
            
            // Validate date format (YYYY-MM-DD)
            if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
                throw new Error('Invalid date format in wake day key');
            }
            
            // Validate time format (HH:MM)
            if (!/^\d{2}:\d{2}$/.test(time)) {
                throw new Error('Invalid time format in wake day key');
            }
            
            return { date, wakeTime: time };
        } catch (error) {
            console.error('Error parsing wake day key:', error);
            return null;
        }
    },
    
    isWakeDayExpired(wakeDayKey, hoursThreshold = 24) {
        const parsed = this.parseWakeDayKey(wakeDayKey);
        if (!parsed) return true;
        
        const { date, wakeTime } = parsed;
        const wakeDateTime = new Date(`${date}T${wakeTime}:00`);
        const now = new Date();
        const hoursPassed = (now - wakeDateTime) / (1000 * 60 * 60);
        
        return hoursPassed >= hoursThreshold;
    },
    
    getMostRecentUncompletedWakeDay(wakeDays) {
        if (!wakeDays || typeof wakeDays !== 'object') return null;
        
        const uncompletedDays = Object.entries(wakeDays)
            .filter(([key, day]) => day && day.isCompleted === false)
            .map(([key, day]) => ({ key, day }));
        
        if (uncompletedDays.length === 0) return null;
        
        // Sort by wake time (most recent first)
        uncompletedDays.sort((a, b) => {
            const parsedA = this.parseWakeDayKey(a.key);
            const parsedB = this.parseWakeDayKey(b.key);
            
            if (!parsedA || !parsedB) return 0;
            
            const dateA = new Date(`${parsedA.date}T${parsedA.wakeTime}:00`);
            const dateB = new Date(`${parsedB.date}T${parsedB.wakeTime}:00`);
            
            return dateB - dateA;
        });
        
        return uncompletedDays[0];
    },
    
    completeExpiredDays(days, saveCallback) {
        if (!days || typeof days !== 'object') return days;
        
        const updatedDays = { ...days };
        let hasChanges = false;
        
        Object.entries(updatedDays).forEach(([key, day]) => {
            if (day && !day.isCompleted && this.isWakeDayExpired(key)) {
                updatedDays[key] = {
                    ...day,
                    isCompleted: true,
                    completedAt: new Date().toISOString(),
                    autoCompleted: true
                };
                hasChanges = true;
            }
        });
        
        if (hasChanges && saveCallback) {
            saveCallback(updatedDays);
        }
        
        return updatedDays;
    },
    
    addMinutesToTime(timeStr, minutesToAdd) {
        const baseMinutes = this.timeToMinutes(timeStr);
        return this.minutesToTime(baseMinutes + minutesToAdd);
    },
    
    getMinutesSinceWake(timeStr, wakeTimeStr) {
        const timeMinutes = this.timeToMinutes(timeStr);
        const wakeMinutes = this.timeToMinutes(wakeTimeStr);
        let diff = timeMinutes - wakeMinutes;
        if (diff < 0) diff += 1440;
        return diff;
    },
    
    getMinutesBetween(time1, time2) {
        const minutes1 = this.timeToMinutes(time1);
        const minutes2 = this.timeToMinutes(time2);
        let diff = minutes2 - minutes1;
        if (diff < 0) diff += 1440;
        return diff;
    },
    
    formatTime(timeStr, showMinutes = true) {
        if (!timeStr) return '';
        try {
            const [hours, minutes] = timeStr.split(':').map(n => parseInt(n));
            
            if (showMinutes) {
                const date = new Date();
                date.setHours(hours, minutes);
                return date.toLocaleTimeString('en-US', {
                    hour: 'numeric',
                    minute: '2-digit',
                    hour12: true
                });
            }
            
            const isPM = hours >= 12;
            const displayHour = hours === 0 ? 12 : hours > 12 ? hours - 12 : hours;
            return `${displayHour} ${isPM ? 'PM' : 'AM'}`;
        } catch (error) {
            return timeStr;
        }
    }
};

const TimelineCalculator = {
    PIXELS_PER_TILE: 120,
    MIN_TILE_SPACING: 90,
    TIMELINE_PADDING: 40,
    MIN_MARKER_SPACING: 20,
    
    generateTimeline(habits, wakeUpTime) {
        const wakeMinutes = TimeUtils.timeToMinutes(wakeUpTime);
        const visibleHabits = habits.filter(h => !h.hidden);
        
        const sortedHabits = [...visibleHabits].sort((a, b) => {
            const aMinutes = TimeUtils.getMinutesSinceWake(a.effectiveTime, wakeUpTime);
            const bMinutes = TimeUtils.getMinutesSinceWake(b.effectiveTime, wakeUpTime);
            return aMinutes - bMinutes;
        });
        
        const segments = this.createEqualSpacedSegments(sortedHabits, wakeUpTime);
        const slots = [];
        
        slots.push({
            time: wakeMinutes,
            position: this.TIMELINE_PADDING,
            label: TimeUtils.formatTime(wakeUpTime, true),
            type: 'wake',
            displayLabel: true,
            minutesSinceWake: 0
        });
        
        segments.forEach(segment => {
            if (segment.habit) {
                slots.push({
                    time: TimeUtils.timeToMinutes(segment.habit.effectiveTime),
                    position: segment.position,
                    label: '',
                    type: 'habit',
                    displayLabel: false,
                    minutesSinceWake: segment.minutesSinceWake
                });
            }
        });
        
        this.addDynamicTimeMarkers(slots, segments, wakeMinutes);
        slots.sort((a, b) => a.position - b.position);
        
        const maxPosition = segments.length > 0 ? 
            segments[segments.length - 1].position + this.PIXELS_PER_TILE : 
            this.TIMELINE_PADDING + 400;
        
        return { slots, height: maxPosition + this.TIMELINE_PADDING * 2, segments };
    },
    
    createEqualSpacedSegments(habits, wakeUpTime) {
        const segments = [];
        const wakeMinutes = TimeUtils.timeToMinutes(wakeUpTime);
        
        segments.push({
            position: this.TIMELINE_PADDING,
            minutesSinceWake: 0,
            actualMinutes: wakeMinutes,
            habit: null
        });
        
        let currentPosition = this.TIMELINE_PADDING;
        habits.forEach(habit => {
            currentPosition += this.PIXELS_PER_TILE;
            segments.push({
                position: currentPosition,
                minutesSinceWake: TimeUtils.getMinutesSinceWake(habit.effectiveTime, wakeUpTime),
                actualMinutes: TimeUtils.timeToMinutes(habit.effectiveTime),
                habit
            });
        });
        
        if (habits.length > 0) {
            currentPosition += this.PIXELS_PER_TILE;
            segments.push({
                position: currentPosition,
                minutesSinceWake: 1440,
                actualMinutes: wakeMinutes,
                habit: null
            });
        }
        
        return segments;
    },
    
    addDynamicTimeMarkers(slots, segments, wakeMinutes) {
        if (segments.length < 2) return;

        const endMinutesSinceWake = segments[segments.length - 1].minutesSinceWake;
        const wakeHour = Math.floor(wakeMinutes / 60);
        const firstClockHour = (wakeHour + 1) * 60;
        
        let currentClockMinutes = firstClockHour;
        let hourCount = 0;
        const maxHours = 24;
        
        while (hourCount < maxHours) {
            let minutesSinceWake = currentClockMinutes - wakeMinutes;
            if (minutesSinceWake < 0) minutesSinceWake += 1440;
            if (minutesSinceWake > endMinutesSinceWake) break;
            
            const position = this.interpolatePosition(minutesSinceWake, segments);
            if (position !== null) {
                slots.push({
                    time: currentClockMinutes % 1440,
                    position,
                    label: TimeUtils.formatTime(TimeUtils.minutesToTime(currentClockMinutes % 1440), false),
                    type: 'hour',
                    displayLabel: true,
                    minutesSinceWake,
                    priority: 1
                });
            }
            
            currentClockMinutes += 60;
            hourCount++;
        }
        
        for (let i = 0; i < segments.length - 1; i++) {
            const startSeg = segments[i];
            const endSeg = segments[i + 1];
            
            const timeDiff = endSeg.minutesSinceWake - startSeg.minutesSinceWake;
            const pixelDiff = endSeg.position - startSeg.position;
            const pixelsPerMinute = pixelDiff / timeDiff;
            
            const includeHalfHours = pixelsPerMinute > 0.2;
            const includeQuarterHours = pixelsPerMinute > 0.4;
            const include5Minutes = pixelsPerMinute > 0.8;
            const includeMinutes = pixelsPerMinute > 4.0;
            
            const segStartClock = wakeMinutes + startSeg.minutesSinceWake;
            const segEndClock = wakeMinutes + endSeg.minutesSinceWake;
            const firstMarkerTime = Math.floor(segStartClock) + 1;
            
            for (let clockTime = firstMarkerTime; clockTime < segEndClock; clockTime++) {
                const actualClockMinutes = clockTime % 1440;
                const clockMod = actualClockMinutes % 60;
                const minutesSinceWake = clockTime - wakeMinutes;
                
                if (minutesSinceWake <= startSeg.minutesSinceWake || 
                    minutesSinceWake >= endSeg.minutesSinceWake) continue;
                
                let markerType = null;
                
                if (clockMod === 0) {
                    continue;
                } else if (clockMod === 30 && includeHalfHours) {
                    markerType = 'medium';
                } else if ((clockMod === 15 || clockMod === 45) && includeQuarterHours) {
                    markerType = 'minor';
                } else if (clockMod % 5 === 0 && include5Minutes) {
                    markerType = 'micro';
                } else if (includeMinutes) {
                    markerType = 'micro';
                } else {
                    continue;
                }
                
                const progress = (minutesSinceWake - startSeg.minutesSinceWake) / timeDiff;
                const position = startSeg.position + progress * pixelDiff;
                
                slots.push({
                    time: actualClockMinutes,
                    position,
                    label: '',
                    type: markerType,
                    displayLabel: false,
                    minutesSinceWake
                });
            }
        }
        
        this.resolveOverlappingLabels(slots);
    },
    
    interpolatePosition(minutesSinceWake, segments) {
        for (let i = 0; i < segments.length - 1; i++) {
            const start = segments[i];
            const end = segments[i + 1];
            
            if (minutesSinceWake >= start.minutesSinceWake && 
                minutesSinceWake <= end.minutesSinceWake) {
                const progress = (minutesSinceWake - start.minutesSinceWake) / 
                               (end.minutesSinceWake - start.minutesSinceWake);
                return start.position + (end.position - start.position) * progress;
            }
        }
        return null;
    },
    
    resolveOverlappingLabels(slots) {
        const labeledSlots = slots.filter(s => s.displayLabel && s.type !== 'wake');
        labeledSlots.sort((a, b) => {
            if (Math.abs(a.position - b.position) < this.MIN_MARKER_SPACING) {
                return (b.priority || 0) - (a.priority || 0);
            }
            return a.position - b.position;
        });
        
        const visibleLabels = [];
        for (const slot of labeledSlots) {
            const tooClose = visibleLabels.some(visible => 
                Math.abs(visible.position - slot.position) < this.MIN_MARKER_SPACING * 1.5
            );
            
            if (!tooClose) {
                visibleLabels.push(slot);
            } else {
                slot.displayLabel = false;
            }
        }
    },
    
    timeToPosition(timeStr, slots, wakeUpTime) {
        const targetMinutesSinceWake = TimeUtils.getMinutesSinceWake(timeStr, wakeUpTime);
        const segments = this.reconstructSegments(slots);
        
        for (let i = 0; i < segments.length - 1; i++) {
            const start = segments[i];
            const end = segments[i + 1];
            
            if (targetMinutesSinceWake >= start.minutesSinceWake && 
                targetMinutesSinceWake <= end.minutesSinceWake) {
                const progress = (targetMinutesSinceWake - start.minutesSinceWake) / 
                               (end.minutesSinceWake - start.minutesSinceWake);
                return start.position + (end.position - start.position) * progress;
            }
        }
        
        return this.TIMELINE_PADDING;
    },
    
    positionToTime(position, slots, wakeUpTime) {
        const wakeMinutes = TimeUtils.timeToMinutes(wakeUpTime);
        const segments = this.reconstructSegments(slots);
        
        if (segments.length > 0 && position < segments[0].position) {
            return { timeStr: wakeUpTime, minutesSinceWake: 0 };
        }
        
        if (segments.length > 0 && position > segments[segments.length - 1].position) {
            return {
                timeStr: TimeUtils.minutesToTime((wakeMinutes + 1439) % 1440),
                minutesSinceWake: 1439
            };
        }
        
        for (let i = 0; i < segments.length - 1; i++) {
            const start = segments[i];
            const end = segments[i + 1];
            
            if (position >= start.position && position <= end.position) {
                const progress = (position - start.position) / (end.position - start.position);
                const targetMinutesSinceWake = start.minutesSinceWake + 
                    (end.minutesSinceWake - start.minutesSinceWake) * progress;
                const targetMinutes = (wakeMinutes + targetMinutesSinceWake) % 1440;
                
                return {
                    timeStr: TimeUtils.minutesToTime(targetMinutes),
                    minutesSinceWake: targetMinutesSinceWake
                };
            }
        }
        
        return { timeStr: wakeUpTime, minutesSinceWake: 0 };
    },
    
    reconstructSegments(slots) {
        const segments = [];
        const wakeSlot = slots.find(s => s.type === 'wake');
        
        if (wakeSlot) {
            segments.push({
                position: wakeSlot.position,
                minutesSinceWake: 0
            });
        }
        
        const habitSlots = slots.filter(s => s.type === 'habit')
            .sort((a, b) => a.minutesSinceWake - b.minutesSinceWake);
        
        habitSlots.forEach(slot => {
            segments.push({
                position: slot.position,
                minutesSinceWake: slot.minutesSinceWake
            });
        });
        
        if (habitSlots.length > 0) {
            const lastHabit = habitSlots[habitSlots.length - 1];
            segments.push({
                position: lastHabit.position + this.PIXELS_PER_TILE,
                minutesSinceWake: 1440
            });
        }
        
        return segments;
    }
};

const Utils = {
    generateId() {
        return Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
    },

    sanitize(str, maxLength = 100) {
        return str ? str.trim().slice(0, maxLength) : '';
    },

    debounce(func, wait) {
        let timeout;
        return (...args) => {
            clearTimeout(timeout);
            timeout = setTimeout(() => func(...args), wait);
        };
    },

    formatDuration(minutes) {
        if (minutes < 60) {
            return `${minutes}min`;
        }
        const hours = Math.floor(minutes / 60);
        const mins = minutes % 60;
        return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
    }
};

const Storage = {
    async load() {
        try {
            const data = localStorage.getItem('habitTracker');
            const parsed = data ? JSON.parse(data) : this.getDefault();
            
            // Migration logic for old data structure
            if (parsed.templates && !parsed.days) {
                parsed.days = this.migrateToWakeDays(parsed);
            }
            
            if (window.db) {
                try {
                    const { doc, getDoc } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js');
                    const docRef = doc(window.db, 'users', this.getUserId());
                    const docSnap = await getDoc(docRef);
                    
                    if (docSnap.exists()) {
                        const firebaseData = docSnap.data();
                        
                        // Migration for firebase data
                        if (firebaseData.templates && !firebaseData.days) {
                            firebaseData.days = this.migrateToWakeDays(firebaseData);
                        }
                        
                        if (firebaseData.updatedAt > parsed.updatedAt) {
                            localStorage.setItem('habitTracker', JSON.stringify(firebaseData));
                            return firebaseData;
                        }
                    }
                } catch (error) {
                    console.log('Firebase sync failed, using local data:', error);
                }
            }
            
            return parsed;
        } catch (error) {
            console.error('Load error:', error);
            return this.getDefault();
        }
    },

    async save(data) {
        try {
            console.log('Storage.save called');
            const dataWithTimestamp = {
                ...data,
                updatedAt: new Date().toISOString()
            };
            
            console.log('Attempting localStorage.setItem...');
            localStorage.setItem('habitTracker', JSON.stringify(dataWithTimestamp));
            console.log('localStorage.setItem succeeded');
            
            if (window.db) {
                try {
                    console.log('Attempting Firebase sync...');
                    const { doc, setDoc } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js');
                    await setDoc(doc(window.db, 'users', this.getUserId()), dataWithTimestamp);
                    console.log('Firebase sync succeeded');
                } catch (error) {
                    console.log('Firebase sync failed, data saved locally:', error);
                }
            }
            
            return true;
        } catch (error) {
            console.error('Save failed:', error);
            console.error('Error details:', {
                name: error.name,
                message: error.message,
                stack: error.stack
            });
            
            // Check if it's a quota exceeded error
            if (error.name === 'QuotaExceededError' || error.code === 22) {
                console.error('localStorage quota exceeded!');
                alert('Storage is full. Please clear some old data using the Clear All Data button.');
            }
            
            return false;
        }
    },

    async saveHistory(historyData) {
        // Deprecated - history is now part of days structure
        console.log('saveHistory called but deprecated - data is now in days structure');
    },

    getUserId() {
        let userId = localStorage.getItem('userId');
        if (!userId) {
            userId = 'user_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
            localStorage.setItem('userId', userId);
        }
        return userId;
    },

    getDefault() {
        return {
            days: {},
            settings: { theme: 'light', notifications: true }
        };
    },
    
    migrateToWakeDays(oldData) {
        const days = {};
        
        // Get all dates that have data
        const allDates = new Set();
        if (oldData.completions) {
            Object.keys(oldData.completions).forEach(date => allDates.add(date));
        }
        if (oldData.awake) {
            Object.keys(oldData.awake).forEach(date => allDates.add(date));
        }
        
        // Convert each date to wake day format
        allDates.forEach(date => {
            const wakeTime = oldData.wakeUpTimes?.[date] || '06:00';
            const wakeDayKey = TimeUtils.getWakeDayKey(wakeTime, date);
            
            // Create habits array from templates with completion status
            const habits = (oldData.templates || []).map(template => {
                const habitData = {
                    ...template,
                    completed: oldData.completions?.[date]?.includes(template.id) || false,
                    subHabits: (template.subHabits || []).map(sub => ({
                        ...sub,
                        completed: oldData.subCompletions?.[date]?.includes(sub.id) || false
                    }))
                };
                return habitData;
            });
            
            days[wakeDayKey] = {
                date,
                wakeTime,
                isCompleted: !oldData.awake?.[date], // If not awake, day is completed
                habits,
                stats: this.calculateDayStats(habits),
                completedAt: oldData.awake?.[date] ? null : new Date(date).toISOString()
            };
        });
        
        return days;
    },
    
    calculateDayStats(habits) {
        const total = habits.length;
        const completed = habits.filter(h => h.completed).length;
        
        return {
            total,
            completed,
            rate: total > 0 ? Math.round((completed / total) * 100) : 0
        };
    }
};

const Analytics = {
    calculateStreak(days) {
        if (!days || Object.keys(days).length === 0) return 0;
        
        // Get all completed days sorted by date
        const completedDays = Object.entries(days)
            .filter(([key, day]) => day.isCompleted && day.stats?.rate >= 80)
            .map(([key, day]) => ({
                key,
                date: new Date(`${day.date}T${day.wakeTime}:00`)
            }))
            .sort((a, b) => b.date - a.date);
        
        if (completedDays.length === 0) return 0;
        
        let streak = 0;
        let expectedDate = new Date();
        
        for (const dayInfo of completedDays) {
            const daysDiff = Math.floor((expectedDate - dayInfo.date) / (1000 * 60 * 60 * 24));
            
            if (daysDiff <= 1) {
                streak++;
                expectedDate = new Date(dayInfo.date);
                expectedDate.setDate(expectedDate.getDate() - 1);
            } else {
                break;
            }
        }
        
        return streak;
    },

    calculateWeeklyRate(days) {
        if (!days || Object.keys(days).length === 0) return 0;
        
        const now = new Date();
        const weekAgo = new Date(now);
        weekAgo.setDate(weekAgo.getDate() - 7);
        
        let total = 0;
        let completed = 0;
        
        Object.entries(days).forEach(([key, day]) => {
            const dayDate = new Date(`${day.date}T${day.wakeTime}:00`);
            if (dayDate >= weekAgo && dayDate <= now) {
                total += day.stats?.total || 0;
                completed += day.stats?.completed || 0;
            }
        });
        
        return total > 0 ? Math.round((completed / total) * 100) : 0;
    },

    calculateDailyStats(days) {
        if (!days) return null;
        
        const now = new Date();
        const today = TimeUtils.getDateKey(now);
        const yesterday = TimeUtils.getDateKey(new Date(now.getTime() - 86400000));
        
        // Find today's and yesterday's days
        let todayStats = { completed: 0, total: 0, rate: 0 };
        let yesterdayStats = { completed: 0, total: 0, rate: 0 };
        
        Object.entries(days).forEach(([key, day]) => {
            if (day.date === today && !day.isCompleted) {
                todayStats = day.stats || todayStats;
            } else if (day.date === yesterday) {
                yesterdayStats = day.stats || yesterdayStats;
            }
        });
        
        // Calculate week stats
        let weekTotal = 0;
        let weekCompleted = 0;
        const weekAgo = new Date(now);
        weekAgo.setDate(weekAgo.getDate() - 7);
        
        Object.entries(days).forEach(([key, day]) => {
            const dayDate = new Date(`${day.date}T${day.wakeTime}:00`);
            if (dayDate >= weekAgo && dayDate <= now) {
                weekTotal += day.stats?.total || 0;
                weekCompleted += day.stats?.completed || 0;
            }
        });
        
        // Calculate all time stats
        let allTimeTotal = 0;
        let allTimeCompleted = 0;
        
        Object.values(days).forEach(day => {
            allTimeTotal += day.stats?.total || 0;
            allTimeCompleted += day.stats?.completed || 0;
        });
        
        return {
            today: todayStats,
            yesterday: yesterdayStats,
            week: {
                completed: weekCompleted,
                total: weekTotal,
                rate: weekTotal > 0 ? Math.round((weekCompleted / weekTotal) * 100) : 0
            },
            allTime: {
                completed: allTimeCompleted,
                total: allTimeTotal,
                rate: allTimeTotal > 0 ? Math.round((allTimeCompleted / allTimeTotal) * 100) : 0
            }
        };
    }
};

const Notifications = {
    async request() {
        if ('Notification' in window) {
            return await Notification.requestPermission() === 'granted';
        }
        return false;
    },

    show(title, body) {
        if ('Notification' in window && Notification.permission === 'granted') {
            const notification = new Notification(title, { 
                body, 
                icon: '/favicon.ico',
                badge: '/favicon.ico',
                requireInteraction: false
            });
            setTimeout(() => notification.close(), 5000);
            return notification;
        }
    },

    scheduleHabit(habit, wakeUpTime) {
        if (!habit || !habit.effectiveTime) return;
        
        const now = new Date();
        const [hours, minutes] = habit.effectiveTime.split(':');
        const habitTime = new Date();
        habitTime.setHours(parseInt(hours), parseInt(minutes), 0, 0);
        
        if (habitTime <= now) {
            habitTime.setDate(habitTime.getDate() + 1);
        }
        
        const timeUntil = habitTime.getTime() - now.getTime();
        
        if (timeUntil > 0 && timeUntil < 24 * 60 * 60 * 1000) {
            setTimeout(() => {
                this.show(
                    `⏰ Time for: ${habit.title}`, 
                    habit.description || `Let's build this habit! Duration: ${habit.duration || 30} minutes`
                );
            }, timeUntil);
            
            if (timeUntil > 10 * 60 * 1000) {
                setTimeout(() => {
                    this.show(
                        `🔔 Upcoming: ${habit.title}`, 
                        `Starting in 10 minutes`
                    );
                }, timeUntil - 10 * 60 * 1000);
            }
        }
    },

    scheduleAllHabits(habits, wakeUpTime) {
        if (!habits || !Array.isArray(habits)) return;
        
        habits.forEach(habit => {
            if (!habit.completed && habit.effectiveTime) {
                this.scheduleHabit(habit, wakeUpTime);
            }
        });
    }
};

window.Storage = Storage;
window.Utils = Utils;
window.Analytics = Analytics;
window.Notifications = Notifications;
window.TimeUtils = TimeUtils;
window.TimelineCalculator = TimelineCalculator;