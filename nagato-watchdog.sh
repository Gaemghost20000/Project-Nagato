#!/bin/bash
# Nagato Auto-Recovery Watchdog
# Monitors Nagato tmux session and restarts if it crashes
# Deployed on the VM alongside Nagato

TMUX_SESSION="nagato-agent"
LOG_FILE="/home/hermes/watchdog.log"
MAX_RESTARTS=10
RESTART_COUNT=0
COOLDOWN=30
HEARTBEAT_URL="http://localhost:5000/api/agent/watchdog"

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" | tee -a "$LOG_FILE"
}

notify_telegram() {
    local msg="$1"
    # Use the Nagato bot to notify
    curl -s "https://api.telegram.org/bot8309650937:AAEOxIGFpsCxnj6OniqKk__sTM_66fdc7X0/sendMessage" \
        -d chat_id="5605299732" \
        -d text="🔄 Nagato Watchdog: $msg" \
        --connect-timeout 5 > /dev/null 2>&1
}

send_heartbeat() {
    curl -s -X POST "$HEARTBEAT_URL" \
        -H "Content-Type: application/json" \
        -d "{\"agent\":\"nagato-watchdog\",\"status\":\"monitoring\",\"restarts\":$RESTART_COUNT,\"session\":\"$TMUX_SESSION\",\"timestamp\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\"}" \
        --connect-timeout 3 > /dev/null 2>&1
}

log "🐕 Watchdog started — monitoring tmux session '$TMUX_SESSION'"
log "   Max restarts: $MAX_RESTARTS, Cooldown: ${COOLDOWN}s"

while true; do
    # Check if tmux session exists
    if ! tmux has-session -t "$TMUX_SESSION" 2>/dev/null; then
        RESTART_COUNT=$((RESTART_COUNT + 1))
        
        if [ $RESTART_COUNT -gt $MAX_RESTARTS ]; then
            log "❌ Max restarts ($MAX_RESTARTS) exceeded. Manual intervention needed."
            notify_telegram "❌ Max restarts reached ($MAX_RESTARTS). Needs manual check."
            exit 1
        fi
        
        log "⚠️  Session '$TMUX_SESSION' is DOWN (restart #$RESTART_COUNT/$MAX_RESTARTS)"
        notify_telegram "⚠️ Session crashed! Restart #$RESTART_COUNT..."
        
        # Clean up dead session
        tmux kill-session -t "$TMUX_SESSION" 2>/dev/null
        
        # Wait before restart
        sleep $COOLDOWN
        
        # Restart Nagato with the original launch command
        log "🔄 Restarting Nagato..."
        tmux new-session -d -s "$TMUX_SESSION" -x 120 -y 40 \
            'cd /home/hermes && python3 hermes_agent.py --model xiaomi/mimo-v2-pro --provider nous --yolo 2>&1 | tee -a /home/hermes/nagato-output.log'
        
        sleep 5
        
        if tmux has-session -t "$TMUX_SESSION" 2>/dev/null; then
            log "✅ Nagato restarted successfully"
            notify_telegram "✅ Restarted successfully (attempt #$RESTART_COUNT)"
        else
            log "❌ Restart failed"
            notify_telegram "❌ Restart failed (attempt #$RESTART_COUNT)"
        fi
    else
        # Session is healthy - check if it's responsive
        LAST_OUTPUT=$(tmux capture-pane -t "$TMUX_SESSION" -p 2>/dev/null | tail -5)
        
        # Check for error patterns
        if echo "$LAST_OUTPUT" | grep -qi "context.*too.*big\|token.*limit\|context_length\|maximum context"; then
            log "⚠️  Detected context overflow in session output"
            notify_telegram "⚠️ Context overflow detected, may need intervention"
            # Don't auto-kill for context issues — just warn
        fi
        
        # Reset restart count if healthy for a while
        if [ $RESTART_COUNT -gt 0 ]; then
            # If stable for 10 minutes, reset counter
            STABLE_CHECK=$(tmux list-sessions -F '#{session_name}:#{session_created}' 2>/dev/null | grep "$TMUX_SESSION" | cut -d: -f2)
            if [ -n "$STABLE_CHECK" ]; then
                NOW=$(date +%s)
                UPTIME=$((NOW - STABLE_CHECK))
                if [ $UPTIME -gt 600 ]; then
                    RESTART_COUNT=0
                    log "✅ Session stable for 10+ min, reset restart counter"
                fi
            fi
        fi
    fi
    
    # Send heartbeat
    send_heartbeat
    
    # Poll interval
    sleep 10
done
