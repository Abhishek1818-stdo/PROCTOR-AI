
import { useCallback, useEffect, useRef, useState } from "react";
import api from "./api";
import "./Exam.css";

function getErrorMessage(error) {
  const detail = error.response?.data?.detail;
  return typeof detail === "string"
    ? detail
    : "Something went wrong. Please try again.";
}

function getRemainingSeconds(expiryAt) {
  const expiry = new Date(expiryAt).getTime();
  return Math.max(0, Math.floor((expiry - Date.now()) / 1000));
}

function formatTime(seconds) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainingSeconds = seconds % 60;

  return [hours, minutes, remainingSeconds]
    .map((value) => String(value).padStart(2, "0"))
    .join(":");
}

export default function Exam({ assessment, onExit, onCompleted }) {
  const [questions, setQuestions] = useState([]);
  const [attempt, setAttempt] = useState(null);
  const [answers, setAnswers] = useState({});
  const [reviewIds, setReviewIds] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [remainingSeconds, setRemainingSeconds] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [examStarted, setExamStarted] = useState(false);
  const [showSubmitModal, setShowSubmitModal] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
const [microphoneReady, setMicrophoneReady] = useState(false);
const [proctoringError, setProctoringError] = useState("");
const [proctoringChecked, setProctoringChecked] = useState(false);

const proctoringStreamRef = useRef(null);
const proctoringBlockedRef = useRef(true); 

  const answersRef = useRef({});
  const startedAtRef = useRef(Date.now());
  const submittingRef = useRef(false);

  const token = sessionStorage.getItem("access_token");
  const authConfig = {
    headers: { Authorization: `Bearer ${token}` },
  };

  const currentQuestion = questions[currentIndex];
  const currentAnswer = currentQuestion
    ? answers[currentQuestion.id] || ""
    : "";

  const answeredCount = questions.filter((question) =>
    Boolean(answers[question.id])
  ).length;

  const unansweredCount = questions.length - answeredCount;
  const reviewedCount = reviewIds.length;
  const progress = questions.length
    ? (answeredCount / questions.length) * 100
    : 0;

  
  const loadExam = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const questionResponse = await api.get(
        `/assessments/${assessment.id}/questions/`
      );

      const loadedQuestions = questionResponse.data;

      if (!Array.isArray(loadedQuestions) || loadedQuestions.length === 0) {
        setQuestions([]);
        setError("This assessment has no questions yet.");
        return;
      }

      const attemptResponse = await api.post(
        "/attempts/",
        { assessment_id: assessment.id },
        authConfig
      );

      const newAttempt = attemptResponse.data;

      // Load answers already saved for this attempt.
      const savedAnswersResponse = await api.get(
        `/attempts/${newAttempt.id}/answers`,
        authConfig
      );

      const savedAnswers = savedAnswersResponse.data;
      const restoredAnswers = {};

      // Support either a direct array or an object containing an answers array.
      const answerList = Array.isArray(savedAnswers)
        ? savedAnswers
        : Array.isArray(savedAnswers?.answers)
          ? savedAnswers.answers
          : [];

      answerList.forEach((item) => {
        const questionId = item.question_id;
        const selectedOption = item.selected_option;

        if (questionId != null && selectedOption) {
          restoredAnswers[questionId] = selectedOption;
        }
      });

      setQuestions(loadedQuestions);
      setAttempt(newAttempt);
      setAnswers(restoredAnswers);
      answersRef.current = restoredAnswers;

      setRemainingSeconds(
        getRemainingSeconds(newAttempt.server_expiry_at)
      );

      setExamStarted(true);
      startedAtRef.current = Date.now();
    } catch (requestError) {
      setError(getErrorMessage(requestError));
    } finally {
      setLoading(false);
    }
  }, [assessment.id]);

  const updateBackendProctoringStatus = async (
    attemptId,
    cameraReady,
    microphoneReady
  ) => {
    try {
      await api.patch(
        `/attempts/${attemptId}/proctoring-status`,
        {
          camera_ready: cameraReady,
          microphone_ready: microphoneReady,
        },
        authConfig
      );
    } catch (error) {
  console.error("Failed to update backend proctoring status:", error);
  throw error;
}
  };

  useEffect(() => {
    loadExam();
  }, [loadExam]);
  

  useEffect(() => {
    let mounted = true;
    let mediaStream = null;
    let checkInterval = null;
    let retryTimeout = null;
    let requestingAccess = false;

    const stopStream = () => {
      if (mediaStream) {
        mediaStream.getTracks().forEach((track) => {
          track.removeEventListener("ended", handleTrackEnded);
          track.removeEventListener("mute", checkDevices);
          track.stop();
        });

        mediaStream = null;
      }

      proctoringStreamRef.current = null;
    };

    const checkDevices = () => {
      if (!mounted || !mediaStream) return;

      const camera = mediaStream.getVideoTracks()[0];
      const microphone = mediaStream.getAudioTracks()[0];

      const cameraIsReady =
        Boolean(camera) &&
        camera.readyState === "live" &&
        camera.enabled &&
        !camera.muted;

      const microphoneIsReady =
        Boolean(microphone) &&
        microphone.readyState === "live" &&
        microphone.enabled &&
        !microphone.muted;

      setCameraReady(cameraIsReady);
      setMicrophoneReady(microphoneIsReady);
      setProctoringChecked(true);

      const devicesAreReady = cameraIsReady && microphoneIsReady;
      proctoringBlockedRef.current = !devicesAreReady;

      setProctoringError(
        devicesAreReady
          ? ""
          : "Your camera or microphone is unavailable. Allow access and keep both devices connected."
      );

      if (!devicesAreReady) {
        scheduleRetry();
      }
    };

    function handleTrackEnded() {
      if (!mounted) return;

      checkDevices();
      scheduleRetry();
    }

    function scheduleRetry() {
      if (!mounted || retryTimeout !== null) return;

      retryTimeout = window.setTimeout(() => {
        retryTimeout = null;
        startMonitoring();
      }, 2000);
    }

    async function startMonitoring() {
      if (!mounted || requestingAccess) return;

      const camera = mediaStream?.getVideoTracks()[0];
      const microphone = mediaStream?.getAudioTracks()[0];

      if (
        camera?.readyState === "live" &&
        microphone?.readyState === "live"
      ) {
        checkDevices();
        return;
      }

      requestingAccess = true;

      try {
        if (!navigator.mediaDevices?.getUserMedia) {
          throw new Error(
            "Camera and microphone access requires localhost or HTTPS."
          );
        }

        const newStream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: true,
        });

        if (!mounted) {
          newStream.getTracks().forEach((track) => track.stop());
          return;
        }

        stopStream();
        mediaStream = newStream;
        proctoringStreamRef.current = newStream;

        newStream.getTracks().forEach((track) => {
          track.addEventListener("ended", handleTrackEnded);
          track.addEventListener("mute", checkDevices);
          track.addEventListener("unmute", checkDevices);
        });

        checkDevices();
      } catch (error) {
        if (!mounted) return;

        proctoringBlockedRef.current = true;
        setCameraReady(false);
        setMicrophoneReady(false);
        setProctoringChecked(true);

        setProctoringError(
          "Camera and microphone access is required. Allow browser permissions and ensure both devices are available."
        );

        scheduleRetry();
      } finally {
        requestingAccess = false;
      }
    }

    startMonitoring();

    checkInterval = window.setInterval(() => {
      checkDevices();

      const camera = mediaStream?.getVideoTracks()[0];
      const microphone = mediaStream?.getAudioTracks()[0];

      if (
        !camera ||
        !microphone ||
        camera.readyState !== "live" ||
        microphone.readyState !== "live"
      ) {
        scheduleRetry();
      }
    }, 1000);

    return () => {
      mounted = false;

      if (checkInterval !== null) {
        window.clearInterval(checkInterval);
      }

      if (retryTimeout !== null) {
        window.clearTimeout(retryTimeout);
      }

      stopStream();
    };
  }, []);



  useEffect(() => {
    if (!attempt?.id || !proctoringChecked) return;

    let cancelled = false;

    const syncProctoringStatus = async () => {
      try {
        await updateBackendProctoringStatus(
          attempt.id,
          cameraReady,
          microphoneReady
        );
      } catch (error) {
        if (!cancelled) {
          proctoringBlockedRef.current = true;
          setError(
            "Unable to verify camera and microphone status with the server. Please try again."
          );
        }
      }
    };

    syncProctoringStatus();

    return () => {
      cancelled = true;
    };
  }, [
    attempt?.id,
    cameraReady,
    microphoneReady,
    proctoringChecked,
  ]);

  
  useEffect(() => {
    if (!attempt?.id || !examStarted) return;

    const handleVisibilityChange = async () => {
      if (document.hidden) {
        try {
          await api.post(
            `/attempts/${attempt.id}/proctoring-events/`,
            {
              event_type: "TAB_SWITCH",
              severity: "MEDIUM",
              evidence_reference: "Candidate switched away from the exam tab",
            },
            authConfig
          );
        } catch (error) {
          console.error("Failed to record tab switch:", error);
        }
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [attempt?.id, examStarted]);


  const submitExam = useCallback(
    async (automatic = false) => {
      if (!attempt || submittingRef.current) return;
      if (proctoringBlockedRef.current) {
  setError(
    "Submission is blocked. Restore camera and microphone access before submitting."
  );
  setShowSubmitModal(false);
  return;
}
      submittingRef.current = true;
      setSubmitting(true);
      setError("");
      setNotice("");
      setShowSubmitModal(false);

      try {
        const currentAnswers = answersRef.current;

        for (const question of questions) {
          const selectedOption = currentAnswers[question.id];

          if (selectedOption) {
            await api.post(
              `/attempts/${attempt.id}/answers`,
              {
                question_id: question.id,
                selected_option: selectedOption,
                answer_text: null,
                time_spent: Math.max(
                  0,
                  Math.floor(
                    (Date.now() - startedAtRef.current) / 1000
                  )
                ),
              },
              authConfig
            );
          }
        }

        const result = await api.post(
          `/attempts/${attempt.id}/submit`,
          {},
          authConfig
        );

        setNotice(
          automatic
            ? "Time is up. Your assessment has been submitted."
            : "Your assessment was submitted successfully."
        );

        setAttempt((previous) => ({
  ...previous,
  ...result.data,
}));

setExamStarted(false);

if (onCompleted) {
  onCompleted(result.data);
}
      } catch (requestError) {
        setError(getErrorMessage(requestError));
        submittingRef.current = false;
      } finally {
        setSubmitting(false);
      }
    },
    [attempt, questions, onCompleted]
  );

  useEffect(() => {
    if (!attempt || !examStarted || submitting) return undefined;

    const timer = window.setInterval(() => {
      const seconds = getRemainingSeconds(attempt.server_expiry_at);
      setRemainingSeconds(seconds);

      if (seconds <= 0) {
        window.clearInterval(timer);
        submitExam(true);
      }
    }, 1000);

    return () => window.clearInterval(timer);
  }, [attempt, examStarted, submitting, submitExam]);

  async function saveCurrentAnswer() {
    if (!currentQuestion || !attempt) return true;

    const selectedOption = answersRef.current[currentQuestion.id];

    if (!selectedOption) {
      setNotice("No answer selected for this question.");
      return true;
    }

    setSaving(true);
    setError("");
    setNotice("");

    try {
      await api.post(
        `/attempts/${attempt.id}/answers`,
        {
          question_id: currentQuestion.id,
          selected_option: selectedOption,
          answer_text: null,
          time_spent: Math.max(
            0,
            Math.floor((Date.now() - startedAtRef.current) / 1000)
          ),
        },
        authConfig
      );

      setNotice("Answer saved successfully.");
      startedAtRef.current = Date.now();
      return true;
    } catch (requestError) {
      setError(
        `Unable to save your answer. ${getErrorMessage(requestError)}`
      );
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function chooseQuestion(index) {
    if (
      index < 0 ||
      index >= questions.length ||
      saving ||
      submitting ||
      index === currentIndex
    ) {
      return;
    }

    const saved = await saveCurrentAnswer();

    if (saved) {
      setCurrentIndex(index);
      setError("");
      setNotice("");
    }
  }

  async function toggleReview() {
    if (!currentQuestion || !attempt || saving || submitting) return;

    setError("");
    setNotice("");

    if (reviewIds.includes(currentQuestion.id)) {
      setNotice(
        "This question is already marked for review. Your backend does not currently support removing the mark."
      );
      return;
    }

    try {
      await api.post(
        `/attempts/${attempt.id}/answers/${currentQuestion.id}/review`,
        {},
        authConfig
      );

      setReviewIds((previous) =>
        previous.includes(currentQuestion.id)
          ? previous
          : [...previous, currentQuestion.id]
      );

      setNotice("Question marked for review.");
    } catch (requestError) {
      setError(getErrorMessage(requestError));
    }
  }

  if (loading) {
    return (
      <main className="exam-page">
        <div className="exam-message">
          <div className="exam-spinner" />
          <h2>Preparing your assessment</h2>
          <p>Loading your questions and creating your attempt...</p>
        </div>
      </main>
    );
  }

  if (error && questions.length === 0) {
    return (
      <main className="exam-page">
        <div className="exam-message">
          <div className="exam-status-icon exam-status-error">!</div>
          <h2>Unable to open assessment</h2>
          <p className="exam-error">{error}</p>
          <div className="exam-message-actions">
            <button className="exam-secondary-button" onClick={onExit}>
              Return to dashboard
            </button>
            <button className="exam-primary-button" onClick={loadExam}>
              Try again
            </button>
          </div>
        </div>
      </main>
    );
  }

  if (notice && !examStarted && attempt) {
    return (
      <main className="exam-page">
        <div className="exam-message exam-result-message">
          <div className="exam-result-icon">✓</div>
          <p className="exam-eyebrow">ASSESSMENT COMPLETE</p>
          <h1>Assessment submitted</h1>
<p>{notice}</p>
<p>Final Score: {attempt.score ?? 0}</p>
<p>Percentage: {attempt.percentage ?? 0}%</p>
<p>Risk Level: {attempt.risk_level ?? "LOW"}</p>
          <div className="exam-result-stats">
            <div>
              <span>Assessment</span>
              <strong>{assessment.title}</strong>
            </div>
            <div>
              <span>Attempt ID</span>
              <strong>#{attempt.id}</strong>
            </div>
          </div>

          <button className="exam-primary-button" onClick={onExit}>
            Return to dashboard
          </button>
        </div>
      </main>
    );
  }

  if (!currentQuestion) {
    return (
      <main className="exam-page">
        <div className="exam-message">
          <h2>No questions available</h2>
          <button className="exam-secondary-button" onClick={onExit}>
            Return to dashboard
          </button>
        </div>
      </main>
    );
  }

  const options = [
    { key: "A", value: currentQuestion.option_a },
    { key: "B", value: currentQuestion.option_b },
    { key: "C", value: currentQuestion.option_c },
    { key: "D", value: currentQuestion.option_d },
  ];

  const timerWarning = remainingSeconds <= 300;
  const currentIsMarked = reviewIds.includes(currentQuestion.id);

  return (
    <main className="exam-page">
      <header className="exam-header">
        <div className="exam-header-main">
          <div className="exam-brand">
            <span className="exam-brand-icon">A</span>
            <span>AssessIQ</span>
            <span className="exam-header-divider" />
            <span className="exam-live-label">
              <i />
              Assessment in progress
            </span>
          </div>

          <h1>{assessment.title}</h1>
          <p>
            Work through each question and review your answers before
            submitting.
          </p>
        </div>

        <div
          className={`exam-timer ${
            timerWarning ? "exam-timer-warning" : ""
          }`}
          aria-live="polite"
        >
          <span className="exam-timer-label">
            <span className="exam-timer-symbol">◷</span>
            TIME REMAINING
          </span>
          <strong>{formatTime(remainingSeconds)}</strong>
          <span className="exam-timer-caption">
            {timerWarning ? "Less than 5 minutes left" : "Manage your time"}
          </span>
        </div>
      </header>

      <section className="exam-progress-card">
        <div className="exam-progress-heading">
          <div>
            <span className="exam-eyebrow">YOUR PROGRESS</span>
            <h2>
              {answeredCount} <span>/ {questions.length} answered</span>
            </h2>
          </div>
          <span className="exam-progress-percentage">
            {Math.round(progress)}%
          </span>
        </div>

        <div
          className="exam-progress-track"
          role="progressbar"
          aria-label="Questions answered"
          aria-valuemin={0}
          aria-valuemax={questions.length}
          aria-valuenow={answeredCount}
        >
          <div
            className="exam-progress-fill"
            style={{ width: `${progress}%` }}
          />
        </div>

        <div className="exam-progress-stats">
          <span>
            <i className="exam-dot exam-dot-answered" />
            {answeredCount} answered
          </span>
          <span>
            <i className="exam-dot exam-dot-unanswered" />
            {unansweredCount} unanswered
          </span>
          <span>
            <i className="exam-dot exam-dot-review" />
            {reviewedCount} for review
          </span>
        </div>
      </section>
      {proctoringChecked &&
  (!cameraReady || !microphoneReady) && (
    <div
      className="exam-alert exam-alert-error"
      role="alert"
      style={{ marginBottom: "16px" }}
    >
      <strong>Assessment paused</strong>
      <span>{proctoringError}</span>
      <span>
        Your selected answers are retained in the current page.
        Restore both devices to continue.
      </span>
    </div>
  )}

{!proctoringChecked && (
  <div className="exam-alert exam-alert-error" role="status">
    Checking camera and microphone access...
  </div>
)}
      <div className="exam-layout">
        <section className="exam-question-card">
          <div className="exam-question-topline">
            <span className="exam-question-badge">
              QUESTION {String(currentIndex + 1).padStart(2, "0")}
            </span>
            <span className="exam-marks-badge">
              {currentQuestion.marks}{" "}
              {currentQuestion.marks === 1 ? "mark" : "marks"}
            </span>
          </div>

          <div className="exam-question-heading">
            <h2>{currentQuestion.question_text}</h2>
            <p>Select one answer from the options below.</p>
          </div>

          <div className="exam-options">
            {options.map((option) => {
              const selected = currentAnswer === option.key;

              return (
                <label
                  key={option.key}
                  className={`exam-option ${selected ? "selected" : ""}`}
                >
                  <input
  type="radio"
  name={`question-${currentQuestion.id}`}
  value={option.key}
  checked={selected}
  disabled={
    submitting ||
    !proctoringChecked ||
    !cameraReady ||
    !microphoneReady
  }
  onChange={() => {
    setAnswers((previous) => {
      const updated = {
        ...previous,
        [currentQuestion.id]: option.key,
      };

      answersRef.current = updated;
      return updated;
    });

    setNotice("");
    setError("");
  }}
/>
                  <span className="exam-option-letter">{option.key}</span>
                  <span className="exam-option-text">
                    {option.value || "No option text provided"}
                  </span>
                  <span className="exam-option-check" aria-hidden="true">
                    {selected ? "✓" : ""}
                  </span>
                </label>
              );
            })}
          </div>

          <div className="exam-question-footer">
            <button
              className={`exam-review-button ${
                currentIsMarked ? "is-marked" : ""
              }`}
              onClick={toggleReview}
             disabled={
  saving ||
  submitting ||
  !proctoringChecked ||
  !cameraReady ||
  !microphoneReady
}
              type="button"
            >
              <span>{currentIsMarked ? "⚑" : "⚐"}</span>
              {currentIsMarked ? "Marked for review" : "Mark for review"}
            </button>

            <span className="exam-save-status" aria-live="polite">
              {saving ? (
                <>
                  <span className="exam-mini-spinner" />
                  Saving answer...
                </>
              ) : currentAnswer ? (
                <>
                  <span className="exam-save-check">✓</span>
                  Answer selected
                </>
              ) : (
                "No answer selected"
              )}
            </span>
          </div>

          {error && (
            <div className="exam-alert exam-alert-error" role="alert">
              <strong>Something went wrong</strong>
              <span>{error}</span>
            </div>
          )}

          {notice && (
            <div className="exam-alert exam-alert-success" role="status">
              {notice}
            </div>
          )}

          <div className="exam-navigation-buttons">
            <button
              className="exam-secondary-button"
              disabled={
  currentIndex === 0 ||
  saving ||
  submitting ||
  !proctoringChecked ||
  !cameraReady ||
  !microphoneReady
}
              onClick={() => chooseQuestion(currentIndex - 1)}
              type="button"
            >
              <span>←</span> Previous
            </button>

            {currentIndex < questions.length - 1 ? (
              <button
                className="exam-primary-button"
                disabled={
  saving ||
  submitting ||
  !proctoringChecked ||
  !cameraReady ||
  !microphoneReady
}
                onClick={() => chooseQuestion(currentIndex + 1)}
                type="button"
              >
                {saving ? "Saving..." : "Save & Next"}
                <span>→</span>
              </button>
            ) : (
              <button
                className="exam-primary-button"
                disabled={
  saving ||
  submitting ||
  !proctoringChecked ||
  !cameraReady ||
  !microphoneReady
}
                onClick={saveCurrentAnswer}
                type="button"
              >
                {saving ? "Saving..." : "Save answer"}
                <span>✓</span>
              </button>
            )}
          </div>
        </section>

        <aside className="exam-sidebar">
          <section className="exam-sidebar-card">
            <div className="exam-sidebar-heading">
              <div>
                <span className="exam-eyebrow">NAVIGATION</span>
                <h3>Question overview</h3>
              </div>
              <span className="exam-count-badge">
                {questions.length}
              </span>
            </div>

            <p className="exam-sidebar-description">
              Select a number to move to a question.
            </p>

            <div className="exam-question-grid">
              {questions.map((question, index) => {
                const answered = Boolean(answers[question.id]);
                const marked = reviewIds.includes(question.id);

                return (
                  <button
                    key={question.id}
                    type="button"
                    className={[
                      "exam-question-number",
                      index === currentIndex ? "current" : "",
                      answered ? "answered" : "",
                      marked ? "for-review" : "",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                    onClick={() => chooseQuestion(index)}
                   disabled={
  saving ||
  submitting ||
  !proctoringChecked ||
  !cameraReady ||
  !microphoneReady
}
                    aria-label={`Question ${index + 1}${
                      answered ? ", answered" : ", not answered"
                    }${marked ? ", marked for review" : ""}${
                      index === currentIndex ? ", current question" : ""
                    }`}
                    aria-current={
                      index === currentIndex ? "step" : undefined
                    }
                    title={`Question ${index + 1}`}
                  >
                    {index + 1}
                    {marked && <span className="exam-review-indicator">⚑</span>}
                  </button>
                );
              })}
            </div>

            <div className="exam-legend">
              <span>
                <i className="legend-answered" /> Answered
              </span>
              <span>
                <i className="legend-unanswered" /> Unanswered
              </span>
              <span>
                <i className="legend-review" /> For review
              </span>
            </div>
          </section>

          <section className="exam-submit-card">
            <div className="exam-submit-icon">✓</div>
            <span className="exam-eyebrow">FINAL STEP</span>
            <h3>Ready to finish?</h3>
            <p>
              Review your progress. Once submitted, you cannot resume
              this attempt.
            </p>

            <div className="exam-submit-summary">
              <div>
                <span>Answered</span>
                <strong>{answeredCount}</strong>
              </div>
              <div>
                <span>Remaining</span>
                <strong>{unansweredCount}</strong>
              </div>
            </div>

            <button
              className="exam-submit-button"
              type="button"
              disabled={
  submitting ||
  saving ||
  !proctoringChecked ||
  !cameraReady ||
  !microphoneReady
}
              onClick={() => setShowSubmitModal(true)}
            >
              {submitting ? "Submitting..." : "Review & submit"}
              <span>→</span>
            </button>
          </section>
        </aside>
      </div>

      <footer className="exam-footer">
        <span>AssessIQ</span>
        <span>Your progress is saved as you navigate through questions.</span>
      </footer>

      {showSubmitModal && (
        <div
          className="exam-modal-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setShowSubmitModal(false);
            }
          }}
        >
          <section
            className="exam-submit-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="exam-submit-title"
          >
            <button
              type="button"
              className="exam-modal-close"
              onClick={() => setShowSubmitModal(false)}
              aria-label="Close submission confirmation"
            >
              ×
            </button>

            <div className="exam-modal-icon">?</div>
            <span className="exam-eyebrow">CONFIRM SUBMISSION</span>
            <h2 id="exam-submit-title">Submit your assessment?</h2>
            <p>
              Please check your progress before submitting. You cannot
              resume the attempt after submission.
            </p>

            <div className="exam-modal-stats">
              <div>
                <span>Answered</span>
                <strong>{answeredCount}</strong>
              </div>
              <div>
                <span>Unanswered</span>
                <strong>{unansweredCount}</strong>
              </div>
              <div>
                <span>For review</span>
                <strong>{reviewedCount}</strong>
              </div>
            </div>

            {unansweredCount > 0 && (
              <div className="exam-modal-warning">
                You still have {unansweredCount} unanswered{" "}
                {unansweredCount === 1 ? "question" : "questions"}.
              </div>
            )}

            {error && (
              <div className="exam-alert exam-alert-error" role="alert">
                {error}
              </div>
            )}

            <div className="exam-modal-actions">
              <button
                type="button"
                className="exam-secondary-button"
                onClick={() => setShowSubmitModal(false)}
               disabled={
  submitting ||
  !proctoringChecked ||
  !cameraReady ||
  !microphoneReady
}
              >
                Continue assessment
              </button>
              <button
                type="button"
                className="exam-primary-button"
                onClick={() => submitExam(false)}
                disabled={submitting}
              >
                {submitting ? "Submitting..." : "Confirm submission"}
              </button>
            </div>
          </section>
        </div>
      )}
    </main>
  );
}
