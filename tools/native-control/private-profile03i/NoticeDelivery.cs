using System;
using System.Collections.Concurrent;
using System.Diagnostics;
using System.IO;
using System.Text;
using System.Threading;
using System.Web.Script.Serialization;
using System.Windows.Forms;

namespace RichAudio.GateA.Private01.Supervision {
 sealed class NoticeAck {
  public string Session,Notice,Message,Source;public int ProcessId;public long CreationFileTime,CreatedQpc,DurableAt;
 }
 sealed class NoticeWork {internal object Data;internal NoticeAck Commit;}
 sealed class NoticeDelivery:IDisposable {
  internal static NoticeDelivery Active;
  readonly SupervisorConfiguration config;readonly ConcurrentQueue<NoticeWork> trace=new ConcurrentQueue<NoticeWork>();readonly ConcurrentQueue<NoticeAck> inbox=new ConcurrentQueue<NoticeAck>();
  readonly AutoResetEvent wake=new AutoResetEvent(false);readonly Thread writer;readonly string path;readonly object gate=new object();readonly string instance=Guid.NewGuid().ToString("N");readonly int pid;readonly long creation;
  long ordinal,origin,due,exitDue,hard,acceptedAt;int pending,queued;bool deadlineRecorded,acceptedPublished;volatile bool receiverOpen=true,closing;NoticeAck committing;volatile string state="waiting-for-stop";
  internal long AcceptedAt {get{return Interlocked.Read(ref acceptedAt);}private set{Interlocked.Exchange(ref acceptedAt,value);}}
  internal long FirstTargetAbsence;internal volatile string Error;
  internal bool LateAcknowledgmentReceived,LateAcceptanceAttempt;
  internal NoticeDelivery(SupervisorConfiguration c,string root,string mode,string configurationPath){
   config=c;pid=Process.GetCurrentProcess().Id;creation=ExactIdentity.Capture(pid).CreationFileTime;path=Path.Combine(root,"notice-events.jsonl");Active=this;
   writer=new Thread(Write){IsBackground=true,Name="RichAudio bounded notice evidence"};writer.Start();
   Record("notice-process-started",new{mode=mode,configurationSha256=configurationPath==null?null:SupervisorFiles.Hash(configurationPath),monitoredPid=c.ProcessId,monitoredCreation=c.ProcessStartUtcTicks,transport="bounded-inprocess-mailbox; stdin is a separate control route"});
  }
  internal void Record(string kind,object detail){
   lock(gate){if(closing||Error!=null)return;if(Interlocked.Increment(ref pending)>256){Interlocked.Decrement(ref pending);Error="notice-evidence-queue-full";return;}
    trace.Enqueue(new NoticeWork{Data=new{schema=1,ordinal=++ordinal,qpc=Stopwatch.GetTimestamp(),frequency=Stopwatch.Frequency,utc=DateTime.UtcNow.ToString("o"),session=config.Session,notice=instance,noticePid=pid,noticeCreationFileTime=creation,thread=Thread.CurrentThread.ManagedThreadId,kind=kind,detail=detail}});wake.Set();}
  }
  void Commit(NoticeAck ack){
   lock(gate){if(closing||Error!=null)return;if(Interlocked.Increment(ref pending)>256){Interlocked.Decrement(ref pending);Error="notice-evidence-queue-full";return;}
    trace.Enqueue(new NoticeWork{Commit=ack,Data=new{schema=1,ordinal=++ordinal,qpc=Stopwatch.GetTimestamp(),frequency=Stopwatch.Frequency,utc=DateTime.UtcNow.ToString("o"),session=config.Session,notice=instance,noticePid=pid,noticeCreationFileTime=creation,kind="acceptance-candidate",detail=new{message=ack.Message,accepted=false,deadlineQpc=due,scope="Prepared only; monitor must observe durable completion before deadline"}}});wake.Set();}
  }
  void Write(){
   try{using(var file=new FileStream(path,FileMode.CreateNew,FileAccess.Write,FileShare.Read))using(var output=new StreamWriter(file,new UTF8Encoding(false))){var json=new JavaScriptSerializer();while(!closing||Volatile.Read(ref pending)>0){NoticeWork work;if(!trace.TryDequeue(out work)){wake.WaitOne(20);continue;}
#if SUPERVISION_FIXTURES
    if(work.Commit!=null&&config.FixtureDeliveryFault=="slow-persistence")Thread.Sleep(5500);
#endif
    output.WriteLine(json.Serialize(work.Data));output.Flush();file.Flush(true);if(work.Commit!=null){
#if SUPERVISION_FIXTURES
     if(config.FixtureDeliveryFault!="missing-response")Interlocked.Exchange(ref work.Commit.DurableAt,config.FixtureDeliveryFault=="malformed-response"?-1:Stopwatch.GetTimestamp());
#else
     Interlocked.Exchange(ref work.Commit.DurableAt,Stopwatch.GetTimestamp());
#endif
    }Interlocked.Decrement(ref pending);}}}
   catch(Exception error){Error=error.GetType().Name+": "+error.Message;}
  }
  internal void BeginStop(long start,long end,long ceiling){if(origin!=0)return;origin=start;exitDue=end;hard=ceiling;due=Math.Min(start+5*Stopwatch.Frequency,Math.Min(end,ceiling));state="awaiting-acknowledgment";Record("acknowledgment-window-opened",new{originQpc=origin,deadlineQpc=due,exitDueQpc=end,hardDeadlineQpc=ceiling,clockReset=false});}
  internal void Submit(){SubmitCore(true);}
#if SUPERVISION_FIXTURES
  internal void SubmitFixture(){if(config.Mode!="offline-fixture")throw new InvalidOperationException("fixture source required");SubmitCore(false);}
#endif
  void SubmitCore(bool actualUi){
   Record(actualUi?"button-handler-entered":"fixture-envelope-created",new{button="normal-exit",actualUi=actualUi,accepted=false});var ack=new NoticeAck{Session=config.Session,Notice=instance,ProcessId=pid,CreationFileTime=creation,Message=Guid.NewGuid().ToString("N"),Source=actualUi?"notice-button":"fixture-envelope",CreatedQpc=Stopwatch.GetTimestamp()};
   Record("acknowledgment-created",new{message=ack.Message,createdQpc=ack.CreatedQpc,accepted=false});Record("transmission-initiated",new{message=ack.Message,transport="inprocess-mailbox"});
#if SUPERVISION_FIXTURES
   if(config.FixtureDeliveryFault=="wrong-session")ack.Session=new string('0',32);
   if(config.FixtureDeliveryFault=="wrong-notice")ack.Notice=new string('0',32);
   if(config.FixtureDeliveryFault=="wrong-generation")ack.CreationFileTime++;
   if(config.FixtureDeliveryFault=="malformed-message")ack.Message=null;
   if(config.FixtureDeliveryFault=="receiver-closed")receiverOpen=false;
#endif
   lock(gate){
    if(!receiverOpen||closing||Interlocked.Increment(ref queued)>32){if(receiverOpen&&!closing)Interlocked.Decrement(ref queued);state="delivery-failed";Record("transmission-failed",new{message=ack.Message,reason="receiver-closed-or-mailbox-full",accepted=false});return;}
    inbox.Enqueue(ack);Record("transmission-completed",new{message=ack.Message,envelope=ack,meaning="queued; not accepted"});
   }
  }
  void Reject(NoticeAck ack,string reason){if(reason=="late-receipt")LateAcknowledgmentReceived=true;if(reason=="late-durable-acceptance"||reason=="durable-completion-deadline")LateAcceptanceAttempt=true;state="rejected: "+reason;Record("acknowledgment-rejected",new{message=ack.Message,reason=reason,createdQpc=ack.CreatedQpc,observedQpc=Stopwatch.GetTimestamp(),deadlineQpc=due,accepted=false});}
  internal bool Poll(bool stopped){
   long now=Stopwatch.GetTimestamp();
   if(origin!=0&&now>=due&&AcceptedAt==0&&!deadlineRecorded){deadlineRecorded=true;if(state.StartsWith("awaiting-"))state="deadline-expired";Record("deadline-expired",new{deadlineQpc=due,status=state});}
#if SUPERVISION_FIXTURES
   if(config.FixtureDeliveryFault=="delayed-receiver"&&origin!=0&&now<origin+6*Stopwatch.Frequency)return false;
#endif
   NoticeAck ack;while(inbox.TryDequeue(out ack)){Interlocked.Decrement(ref queued);Record("message-received",new{message=ack.Message,createdQpc=ack.CreatedQpc});
    bool source=ack.Source=="notice-button";
#if SUPERVISION_FIXTURES
    source|=config.Mode=="offline-fixture"&&ack.Source=="fixture-envelope";
#endif
    bool identity=ack.Session==config.Session&&ack.Notice==instance&&ack.ProcessId==pid&&ack.CreationFileTime==creation&&source&&ack.Message!=null&&System.Text.RegularExpressions.Regex.IsMatch(ack.Message,"\\A[a-f0-9]{32}\\z");
    Record("identity-verification",new{message=ack.Message,valid=identity,actualSession=ack.Session,actualNotice=ack.Notice,actualPid=ack.ProcessId,actualCreation=ack.CreationFileTime,source=ack.Source});
    if(!identity){Reject(ack,"session-notice-or-process-generation-mismatch");continue;}
    if(!stopped||origin==0||ack.CreatedQpc<origin||ack.CreatedQpc>now){Reject(ack,"stop-not-active-or-invalid-event-time");continue;}if(AcceptedAt!=0||committing!=null){Reject(ack,"duplicate-acknowledgment");continue;}
    if(now>=due){Reject(ack,"late-receipt");continue;}committing=ack;state="awaiting-durable-acceptance";Commit(ack);
   }
   if(committing!=null){long persisted=Interlocked.Read(ref committing.DurableAt);now=Stopwatch.GetTimestamp();
    if(persisted==0&&now>=due){var item=committing;committing=null;Reject(item,"durable-completion-deadline");}
    else if(persisted!=0){var item=committing;committing=null;if(Error!=null||persisted<origin||persisted>now){Reject(item,"invalid-durable-completion");}else if(persisted>=due||now>=due){Reject(item,"late-durable-acceptance");}else{
     AcceptedAt=now;state="accepted";Record("durable-acceptance-committed",new{message=item.Message,durableAtQpc=persisted,deadlineQpc=due});Record("monitor-acceptance-observed",new{message=item.Message,acceptedAtQpc=AcceptedAt,durableAtQpc=persisted,deadlineQpc=due,accepted=true});
    }}
   }
   if(origin!=0&&now>=due&&AcceptedAt==0&&!deadlineRecorded){deadlineRecorded=true;Record("deadline-expired",new{deadlineQpc=due,status=state});}
   if(AcceptedAt!=0&&!acceptedPublished){acceptedPublished=true;return true;}return false;
  }
  internal void TargetAbsent(long now){if(FirstTargetAbsence!=0)return;FirstTargetAbsence=now;Record("target-exit-observed",new{observedQpc=now,exitDueQpc=exitDue,withinDeadline=now<=exitDue});}
  internal bool CanRetire(long now){return config.Mode=="offline-fixture"&&!config.ShowUi||origin==0||AcceptedAt!=0||now>=Math.Min(due,Math.Min(exitDue,hard));}
  internal string Status(){return state;}
  internal string Title(){return "RichAudio private experiment — notice "+instance.Substring(0,8);}
  internal object Summary(){return new{session=config.Session,notice=instance,pid=pid,creationFileTime=creation,originQpc=origin,deadlineQpc=due,acceptedAtQpc=AcceptedAt,firstTargetAbsenceQpc=FirstTargetAbsence,lateAcknowledgmentReceived=LateAcknowledgmentReceived,lateAcceptanceAttempt=LateAcceptanceAttempt,status=state,evidenceError=Error,transport="inprocess-mailbox"};}
  internal bool Flush(int ms){var timer=Stopwatch.StartNew();while(Volatile.Read(ref pending)>0&&Error==null&&timer.ElapsedMilliseconds<ms)Thread.Sleep(5);return Error==null&&Volatile.Read(ref pending)==0;}
  public void Dispose(){lock(gate){receiverOpen=false;NoticeAck item;while(inbox.TryDequeue(out item)){Interlocked.Decrement(ref queued);Reject(item,"notice-retired-before-receive");}if(committing!=null){Reject(committing,"notice-retired-before-acceptance");committing=null;}}Record("notice-retirement-completed",new{accepted=AcceptedAt!=0});Flush(500);closing=true;wake.Set();if(writer.Join(500))wake.Dispose();else Error="notice-writer-closure-unproven";}
 }
 sealed class OperatorNotice {
  readonly CommandMailbox commands;readonly NoticeDelivery delivery;readonly ManualResetEvent ready=new ManualResetEvent(false),ended=new ManualResetEvent(false);volatile string text="Independent monitor starting. Use normal exit.";volatile bool stop,closed;
  internal OperatorNotice(CommandMailbox commands,NoticeDelivery delivery){this.commands=commands;this.delivery=delivery;}
  internal bool Start(){var thread=new Thread(Run){IsBackground=true,Name="RichAudio correlated stop notice"};thread.SetApartmentState(ApartmentState.STA);thread.Start();return ready.WaitOne(3000);}
  internal void ShowStop(string value){text=value;stop=true;}
  internal void Close(){closed=true;ended.WaitOne(300);}
  void Run(){try{using(var form=new Form{Text=delivery.Title(),Width=650,Height=300,TopMost=true,StartPosition=FormStartPosition.CenterScreen}){
    var label=new Label{Left=15,Top=15,Width=610,Height=95,Text=text};form.Controls.Add(label);
    var status=new Label{Left=15,Top=115,Width=610,Height=45,Text="Acknowledgment: waiting for STOP"};form.Controls.Add(status);
    var ack=new Button{Left=15,Top=190,Width=180,Text="I am exiting normally",Enabled=stop};ack.Click+=delegate{delivery.Submit();};form.Controls.Add(ack);
    ack.MouseDown+=delegate(object sender,MouseEventArgs e){delivery.Record("ack-button-mouse-down",new{button=e.Button.ToString()});};
    ack.MouseUp+=delegate(object sender,MouseEventArgs e){delivery.Record("ack-button-mouse-up",new{button=e.Button.ToString()});};
    var hung=new Button{Left=210,Top=190,Width=180,Text="Normal quit is unresponsive"};hung.Click+=delegate{delivery.Record("unresponsive-button-entered",null);commands.Enqueue("quit-unresponsive");};form.Controls.Add(hung);
    var finish=new Button{Left=405,Top=190,Width=205,Text="Verify installation restoration"};finish.Click+=delegate{delivery.Record("restoration-button-entered",null);commands.Enqueue("verify-restoration");};form.Controls.Add(finish);
    bool displayed=false;var timer=new System.Windows.Forms.Timer{Interval=20};Action display=delegate{label.Text=text;status.Text="Acknowledgment: "+delivery.Status();ack.Enabled=stop&&delivery.AcceptedAt==0;if(stop&&!displayed&&form.Visible){displayed=true;form.BackColor=System.Drawing.Color.MistyRose;ack.Focus();delivery.Record("stop-window-displayed",new{visible=form.Visible,enabled=form.Enabled,ackEnabled=ack.Enabled});}};
    timer.Tick+=delegate{display();if(closed){timer.Stop();form.Close();}};
    form.HandleCreated+=delegate{delivery.Record("window-initialized",new{handle=form.Handle.ToInt64()});};
    form.Shown+=delegate{display();delivery.Record("ui-ready",new{visible=form.Visible,enabled=form.Enabled,ackEnabled=ack.Enabled});ready.Set();};
    form.FormClosing+=delegate(object sender,FormClosingEventArgs e){delivery.Record("window-close-requested",new{normalOwnerClosure=closed});if(!closed){e.Cancel=true;commands.Enqueue("stop");}};
    form.FormClosed+=delegate{delivery.Record("window-retired",null);};timer.Start();Application.Run(form);timer.Dispose();
   }}finally{ended.Set();}}
 }
}
