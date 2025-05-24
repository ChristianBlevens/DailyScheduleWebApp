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
        const slots = [];
        const wakeMinutes = TimeUtils.timeToMinutes(wakeUpTime);
        
        // Filter out any habits that might be marked as hidden
        const visibleHabits = habits.filter(h => !h.hidden);
        
        const sortedHabits = [...visibleHabits].sort((a, b) => {
            const aMinutes = TimeUtils.getMinutesSinceWake(a.effectiveTime, wakeUpTime);
            const bMinutes = TimeUtils.getMinutesSinceWake(b.effectiveTime, wakeUpTime);
            return aMinutes - bMinutes;
        });
        
        // Create segments with equal spacing
        const segments = this.createEqualSpacedSegments(sortedHabits, wakeUpTime);
        
        // Add wake time marker
        slots.push({
            time: wakeMinutes,
            position: this.TIMELINE_PADDING,
            label: TimeUtils.formatTime(wakeUpTime, true),
            type: 'wake',
            displayLabel: true,
            minutesSinceWake: 0
        });
        
        // Add habit markers
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
        
        // Add dynamic time markers
        this.addDynamicTimeMarkers(slots, segments, wakeMinutes);
        
        slots.sort((a, b) => a.position - b.position);
        
        const maxPosition = segments.length > 0 ? 
            segments[segments.length - 1].position + this.PIXELS_PER_TILE : 
            this.TIMELINE_PADDING + 400;
        
        return {
            slots,
            height: maxPosition + this.TIMELINE_PADDING * 2,
            segments // Store for position calculations
        };
    },
    
    createEqualSpacedSegments(habits, wakeUpTime) {
        const segments = [];
        const wakeMinutes = TimeUtils.timeToMinutes(wakeUpTime);
        
        // Start with wake time
        segments.push({
            position: this.TIMELINE_PADDING,
            minutesSinceWake: 0,
            actualMinutes: wakeMinutes,
            habit: null
        });
        
        // Add habits with equal spacing
        let currentPosition = this.TIMELINE_PADDING;
        habits.forEach((habit, index) => {
            currentPosition += this.PIXELS_PER_TILE;
            const minutesSinceWake = TimeUtils.getMinutesSinceWake(habit.effectiveTime, wakeUpTime);
            
            segments.push({
                position: currentPosition,
                minutesSinceWake,
                actualMinutes: TimeUtils.timeToMinutes(habit.effectiveTime),
                habit
            });
        });
        
        // Add end of day
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

        // Calculate actual time boundaries for the entire timeline
        const startMinutesSinceWake = segments[0].minutesSinceWake;
        const endMinutesSinceWake = segments[segments.length - 1].minutesSinceWake;
        
        // Find the first actual clock hour after wake time
        const wakeHour = Math.floor(wakeMinutes / 60);
        const firstClockHour = (wakeHour + 1) * 60; // Next full hour in minutes since midnight
        
        // Add hour markers at actual clock hours
        let currentClockMinutes = firstClockHour;
        let hourCount = 0;
        const maxHours = 24; // Safety limit
        
        while (hourCount < maxHours) {
            let minutesSinceWake = currentClockMinutes - wakeMinutes;
            
            // Handle day wraparound
            if (minutesSinceWake < 0) {
                minutesSinceWake += 1440;
            }
            
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
                    priority: 1 // Highest priority for hour labels
                });
            }
            
            currentClockMinutes += 60; // Next hour
            hourCount++;
        }
        
        // Process each segment for sub-hour markers
        for (let i = 0; i < segments.length - 1; i++) {
            const startSeg = segments[i];
            const endSeg = segments[i + 1];
            
            const timeDiff = endSeg.minutesSinceWake - startSeg.minutesSinceWake;
            const pixelDiff = endSeg.position - startSeg.position;
            const pixelsPerMinute = pixelDiff / timeDiff;
            
            // Determine sub-hour marker density based on available space
            let includeHalfHours = pixelsPerMinute > 0.2;      // 30-min markers
            let includeQuarterHours = pixelsPerMinute > 0.4;   // 15-min markers  
            let include5Minutes = pixelsPerMinute > 0.8;       // 5-min markers
            let includeMinutes = pixelsPerMinute > 4.0;        // 1-min markers
            
            // Find all the sub-hour markers we should add for this segment
            const markersToAdd = [];
            
            // Calculate the actual clock time range for this segment
            const segStartClock = wakeMinutes + startSeg.minutesSinceWake;
            const segEndClock = wakeMinutes + endSeg.minutesSinceWake;
            
            // Find the first relevant marker time in this segment
            // We need to start from just after the segment start to avoid boundary issues
            let firstMarkerTime = Math.floor(segStartClock) + 1;
            
            // Iterate through each minute in the segment
            for (let clockTime = firstMarkerTime; clockTime < segEndClock; clockTime++) {
                const actualClockMinutes = clockTime % 1440;
                const clockMod = actualClockMinutes % 60;
                const minutesSinceWake = clockTime - wakeMinutes;
                
                // Skip if outside segment bounds
                if (minutesSinceWake <= startSeg.minutesSinceWake || 
                    minutesSinceWake >= endSeg.minutesSinceWake) continue;
                
                let markerType = null;
                
                // Determine marker type based on clock time
                if (clockMod === 0) {
                    continue; // Skip hours - already added
                } else if (clockMod === 30 && includeHalfHours) {
                    markerType = 'medium';
                } else if ((clockMod === 15 || clockMod === 45) && includeQuarterHours) {
                    markerType = 'minor';
                } else if (clockMod % 5 === 0 && include5Minutes) {
                    markerType = 'micro';
                } else if (includeMinutes) {
                    markerType = 'micro';
                } else {
                    continue; // Skip this minute
                }
                
                const progress = (minutesSinceWake - startSeg.minutesSinceWake) / timeDiff;
                const position = startSeg.position + progress * pixelDiff;
                
                markersToAdd.push({
                    time: actualClockMinutes,
                    position,
                    label: '',
                    type: markerType,
                    displayLabel: false,
                    minutesSinceWake
                });
            }
            
            slots.push(...markersToAdd);
        }
        
        // Remove overlapping hour labels based on minimum spacing
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
        // Sort slots by position and priority
        const labeledSlots = slots.filter(s => s.displayLabel && s.type !== 'wake');
        labeledSlots.sort((a, b) => {
            if (Math.abs(a.position - b.position) < this.MIN_MARKER_SPACING) {
                return (b.priority || 0) - (a.priority || 0);
            }
            return a.position - b.position;
        });
        
        // Mark overlapping labels for hiding
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
        
        // Find segments from slots
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
        
        // Find segments from slots
        const segments = this.reconstructSegments(slots);
        
        // If position is before the first segment, return wake time
        if (segments.length > 0 && position < segments[0].position) {
            return {
                timeStr: wakeUpTime,
                minutesSinceWake: 0
            };
        }
        
        // If position is after the last segment, return end of day
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
                const progress = (position - start.position) / 
                               (end.position - start.position);
                
                const targetMinutesSinceWake = start.minutesSinceWake + 
                    (end.minutesSinceWake - start.minutesSinceWake) * progress;
                
                const targetMinutes = (wakeMinutes + targetMinutesSinceWake) % 1440;
                return {
                    timeStr: TimeUtils.minutesToTime(targetMinutes),
                    minutesSinceWake: targetMinutesSinceWake
                };
            }
        }
        
        return {
            timeStr: wakeUpTime,
            minutesSinceWake: 0
        };
    },
    
    reconstructSegments(slots) {
        // Reconstruct segments from slots for calculations
        const segments = [];
        
        // Add wake time
        const wakeSlot = slots.find(s => s.type === 'wake');
        if (wakeSlot) {
            segments.push({
                position: wakeSlot.position,
                minutesSinceWake: 0
            });
        }
        
        // Add all habit positions
        const habitSlots = slots.filter(s => s.type === 'habit')
            .sort((a, b) => a.minutesSinceWake - b.minutesSinceWake);
        
        habitSlots.forEach(slot => {
            segments.push({
                position: slot.position,
                minutesSinceWake: slot.minutesSinceWake
            });
        });
        
        // Add end of day if there are habits
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
        } else {
            const hours = Math.floor(minutes / 60);
            const mins = minutes % 60;
            return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
        }
    }
};

const Storage = {
    async load() {
        try {
            const data = localStorage.getItem('habitTracker');
            const parsed = data ? JSON.parse(data) : this.getDefault();
            
            if (window.db) {
                try {
                    const { doc, getDoc } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js');
                    const docRef = doc(window.db, 'users', this.getUserId());
                    const docSnap = await getDoc(docRef);
                    
                    if (docSnap.exists()) {
                        const firebaseData = docSnap.data();
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
            const dataWithTimestamp = {
                ...data,
                updatedAt: new Date().toISOString()
            };
            localStorage.setItem('habitTracker', JSON.stringify(dataWithTimestamp));
            
            if (window.db) {
                try {
                    const { doc, setDoc } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js');
                    await setDoc(doc(window.db, 'users', this.getUserId()), dataWithTimestamp);
                } catch (error) {
                    console.log('Firebase sync failed, data saved locally:', error);
                }
            }
            
            return true;
        } catch (error) {
            console.error('Save failed:', error);
            return false;
        }
    },

    async saveHistory(historyData) {
        if (window.db) {
            try {
                const { doc, setDoc } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js');
                const historyRef = doc(window.db, 'history', this.getUserId() + '_' + TimeUtils.getDateKey());
                await setDoc(historyRef, {
                    ...historyData,
                    userId: this.getUserId(),
                    savedAt: new Date().toISOString()
                });
                console.log('History saved to Firebase');
            } catch (error) {
                console.log('Firebase history save error:', error);
            }
        }
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
            templates: [],
            completions: {},
            subCompletions: {},
            awake: {},
            wakeUpTimes: {},
            history: {},
            settings: { theme: 'light', notifications: true }
        };
    }
};

const Analytics = {
    calculateStreak(completions, habitCount) {
        if (!completions || habitCount === 0) return 0;
        
        let streak = 0;
        let date = new Date();
        
        for (let i = 0; i < 365; i++) {
            const key = TimeUtils.getDateKey(date);
            const completed = completions[key] || [];
            const rate = habitCount > 0 ? completed.length / habitCount : 0;
            
            if (rate >= 0.8) {
                streak++;
                date.setDate(date.getDate() - 1);
            } else {
                break;
            }
        }
        
        return streak;
    },

    calculateWeeklyRate(completions, habitCount) {
        if (!completions || habitCount === 0) return 0;
        
        let total = 0;
        let completed = 0;
        
        for (let i = 0; i < 7; i++) {
            const date = new Date();
            date.setDate(date.getDate() - i);
            const key = TimeUtils.getDateKey(date);
            const dayCompleted = completions[key] || [];
            
            total += habitCount;
            completed += dayCompleted.length;
        }
        
        return total > 0 ? Math.round((completed / total) * 100) : 0;
    },

    calculateDailyStats(data, habits) {
        if (!data || !habits) return null;
        
        const today = TimeUtils.getDateKey();
        const yesterday = TimeUtils.getDateKey(new Date(Date.now() - 86400000));
        
        const todayCompleted = (data.completions?.[today] || []).length;
        const yesterdayCompleted = (data.completions?.[yesterday] || []).length;
        
        let weekTotal = 0, weekCompleted = 0;
        for (let i = 0; i < 7; i++) {
            const date = new Date();
            date.setDate(date.getDate() - i);
            const key = TimeUtils.getDateKey(date);
            weekTotal += habits.length;
            weekCompleted += (data.completions?.[key] || []).length;
        }

        let allTimeTotal = 0, allTimeCompleted = 0;
        if (data.completions) {
            Object.keys(data.completions).forEach(date => {
                allTimeTotal += habits.length;
                allTimeCompleted += data.completions[date].length;
            });
        }

        return {
            today: {
                completed: todayCompleted,
                total: habits.length,
                rate: habits.length > 0 ? Math.round((todayCompleted / habits.length) * 100) : 0
            },
            yesterday: {
                completed: yesterdayCompleted,
                total: habits.length,
                rate: habits.length > 0 ? Math.round((yesterdayCompleted / habits.length) * 100) : 0
            },
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