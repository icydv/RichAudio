// Minimal local settings editor. Saving controls never starts a host or opens audio.
using System;
using System.Collections.Generic;
using System.Drawing;
using System.Globalization;
using System.IO;
using System.Reflection;
using System.Windows.Forms;
using System.Web.Script.Serialization;
using RichAudio.Beacon.Windows;

namespace RichAudio.Settings
{
    public static class StatusPresentation
    {
        private static string Value(Dictionary<string,object> d,string key)
        {object value;if(!d.TryGetValue(key,out value)||value==null)return "unavailable";string text=Convert.ToString(value,CultureInfo.InvariantCulture);return text.Length>240?text.Substring(0,240):text;}
        public static string Render(string text,DateTime now)
        {
            if(text==null)return "Host offline or no status received. Active quality/backend unavailable.";
            try
            {
                if(text.Length>16384)throw new InvalidDataException();
                var wrapper=new JavaScriptSerializer{MaxJsonLength=16384,RecursionLimit=20}.DeserializeObject(text) as Dictionary<string,object>;
                if(wrapper==null || !wrapper.ContainsKey("schemaVersion") || !Equals(wrapper["schemaVersion"],1) || !wrapper.ContainsKey("hostState"))throw new InvalidDataException();
                if(Value(wrapper,"hostState")!="running")return "Host stopped. Active quality/backend unavailable.";
                DateTime recorded;
                if(!DateTime.TryParse(Value(wrapper,"recordedAtUtc"),CultureInfo.InvariantCulture,DateTimeStyles.RoundtripKind,out recorded) ||
                    (now-recorded.ToUniversalTime()).TotalSeconds>3 || (now-recorded.ToUniversalTime()).TotalSeconds< -1)
                    return "Host status is stale. Active quality/backend unavailable.";
                object raw;var d=wrapper.TryGetValue("status",out raw)?raw as Dictionary<string,object>:null;
                if(d==null)return "Host connected; waiting for measured backend status.";
                string quality=Value(d,"activeQuality"),acceleration=Value(d,"activeAcceleration");
                if(Array.IndexOf(AcousticSettings.Qualities,quality)<1 || (acceleration!="cpu" && acceleration!="gpu"))
                    return "Host connected; active quality/backend not yet established.\r\n"+text;
                string summary="Active quality: "+quality+" ("+Value(d,"pathBudget")+" early contributions/source, including direct)"+
                    "\r\nRequested acceleration: "+Value(d,"requestedAcceleration")+"; actual backend: "+acceleration+
                    "\r\nGPU device: "+Value(d,"gpuDevice")+"; capability: "+Value(d,"gpuCapability")+"\r\nFallback: "+Value(d,"fallbackReason")+
                    "\r\nQuality decision: "+Value(d,"qualityReason")+"; processing deadline misses: "+Value(d,"qualityDeadlineMisses")+
                    "; dropped GPU results: "+Value(d,"droppedResults");
                if(wrapper.ContainsKey("settingsError") && wrapper["settingsError"]!=null)summary+="\r\nSettings file: "+Value(wrapper,"settingsError");
                return summary+"\r\n\r\nActual producer diagnostics:\r\n"+new JavaScriptSerializer{MaxJsonLength=16384,RecursionLimit=20}.Serialize(d);
            }
            catch{return "Invalid host status. Active quality/backend unavailable.";}
        }
    }

    public sealed class AcousticSettingsWindow:Form
    {
        private readonly string root,path;
        private readonly Label qualityLabel,selectionLabel;
        private readonly TextBox diagnostics;
        private readonly System.Windows.Forms.Timer timer;
        private long revision;
        internal readonly TrackBar QualitySelector;
        internal readonly ComboBox AccelerationSelector;
        internal string DiagnosticsText{get{return diagnostics.Text;}}
        public AcousticSettingsWindow(string root,string path)
        {
            this.root=root;this.path=AcousticSettingsStore.PrivatePath(root,path);
            Text="RichAudio Acoustic Settings";ClientSize=new Size(680,530);MinimumSize=new Size(600,510);StartPosition=FormStartPosition.CenterScreen;
            var layout=new TableLayoutPanel{Dock=DockStyle.Fill,ColumnCount=1,RowCount=8,Padding=new Padding(16)};
            layout.RowStyles.Add(new RowStyle(SizeType.Absolute,28));layout.RowStyles.Add(new RowStyle(SizeType.Absolute,50));
            layout.RowStyles.Add(new RowStyle(SizeType.Absolute,32));layout.RowStyles.Add(new RowStyle(SizeType.Absolute,40));
            layout.RowStyles.Add(new RowStyle(SizeType.Absolute,36));layout.RowStyles.Add(new RowStyle(SizeType.Absolute,34));
            layout.RowStyles.Add(new RowStyle(SizeType.Percent,100));layout.RowStyles.Add(new RowStyle(SizeType.Absolute,42));
            layout.Controls.Add(new Label{Text="Acoustic Quality",Dock=DockStyle.Fill,Font=new Font(Font,FontStyle.Bold)},0,0);
            QualitySelector=new TrackBar{Minimum=0,Maximum=4,TickFrequency=1,SmallChange=1,LargeChange=1,Dock=DockStyle.Fill,AccessibleName="Acoustic Quality: Auto, Performance, Balanced, Quality, Max"};
            layout.Controls.Add(QualitySelector,0,1);qualityLabel=new Label{Dock=DockStyle.Fill};layout.Controls.Add(qualityLabel,0,2);
            var backend=new FlowLayoutPanel{Dock=DockStyle.Fill};backend.Controls.Add(new Label{Text="Acceleration",AutoSize=true,Padding=new Padding(0,7,12,0)});
            AccelerationSelector=new ComboBox{DropDownStyle=ComboBoxStyle.DropDownList,Width=180,AccessibleName="Acoustic acceleration"};
            AccelerationSelector.Items.AddRange(new object[]{"Auto","CPU","GPU"});backend.Controls.Add(AccelerationSelector);layout.Controls.Add(backend,0,3);
            var save=new Button{Text="Save / apply to configured host",AutoSize=true};save.Click+=delegate{try{SaveSelection();}catch(Exception e){MessageBox.Show(this,e.Message,"Settings not saved",MessageBoxButtons.OK,MessageBoxIcon.Error);}};
            layout.Controls.Add(save,0,4);selectionLabel=new Label{Dock=DockStyle.Fill};layout.Controls.Add(selectionLabel,0,5);
            diagnostics=new TextBox{Multiline=true,ReadOnly=true,ScrollBars=ScrollBars.Vertical,Dock=DockStyle.Fill,AccessibleName="Actual active settings and backend diagnostics"};layout.Controls.Add(diagnostics,0,6);
            layout.Controls.Add(new Label{Text="Save before host startup; live changes require a host already started with acoustic settings. Saving starts no audio or game.",Dock=DockStyle.Fill},0,7);Controls.Add(layout);
            QualitySelector.ValueChanged+=delegate{UpdateSelection();};AccelerationSelector.SelectedIndexChanged+=delegate{UpdateSelection();};
            AcousticSettings initial=File.Exists(this.path)?AcousticSettingsStore.Load(root,this.path):new AcousticSettings("auto","auto",1);
            revision=initial.Revision;QualitySelector.Value=Array.IndexOf(AcousticSettings.Qualities,initial.Quality);AccelerationSelector.SelectedIndex=Array.IndexOf(AcousticSettings.Accelerations,initial.Acceleration);
            UpdateSelection();RefreshStatus();timer=new System.Windows.Forms.Timer{Interval=1000};timer.Tick+=delegate{RefreshStatus();};timer.Start();
        }
        private void UpdateSelection()
        {
            string[] labels={"Auto — adapts conservatively to measured workload and deadlines","Performance — target 12 early contributions/source",
                "Balanced — target 16 early contributions/source","Quality — target 32 early contributions/source","Max — target 64 early contributions/source; current geometry and two-bounce limits still apply"};
            qualityLabel.Text=labels[QualitySelector.Value];
            selectionLabel.Text="Selected: "+AcousticSettings.Qualities[QualitySelector.Value]+" / "+(AccelerationSelector.SelectedIndex<0?"auto":AcousticSettings.Accelerations[AccelerationSelector.SelectedIndex])+". Save to persist/apply.";
        }
        internal void SaveSelection()
        {
            AcousticSettings existing=File.Exists(path)?AcousticSettingsStore.Load(root,path):null;long current=existing==null?0:existing.Revision;
            long clock=(long)(DateTime.UtcNow-new DateTime(1970,1,1,0,0,0,DateTimeKind.Utc)).TotalMilliseconds;
            revision=Math.Max(clock,Math.Max(revision,current)+1);
            var selected=(existing??AcousticSettings.Defaults(1)).WithSelections(AcousticSettings.Qualities[QualitySelector.Value],AcousticSettings.Accelerations[Math.Max(0,AccelerationSelector.SelectedIndex)],revision);
            AcousticSettingsStore.SaveExpected(root,path,selected,current);selectionLabel.Text="Saved: "+selected.Quality+" / "+selected.Acceleration+". Awaiting actual host status.";
            RefreshStatus();
        }
        internal void RefreshStatus()
        {
            try{string status=AcousticSettingsStore.PrivatePath(root,AcousticSettingsStore.StatusPath(path));
                diagnostics.Text=StatusPresentation.Render(File.Exists(status)?AcousticSettingsStore.ReadBounded(status,16384):null,DateTime.UtcNow);}
            catch{diagnostics.Text="Host status unavailable; active backend is not inferred from the selection.";}
        }
        protected override void Dispose(bool disposing){if(disposing && timer!=null)timer.Dispose();base.Dispose(disposing);}
    }

    public static class SettingsProgram
    {
        [STAThread] public static int Main(string[] args)
        {
            try
            {
                string root=Path.GetFullPath(Path.Combine(Path.GetDirectoryName(Assembly.GetExecutingAssembly().Location),"..","..")),path=null;
                for(int i=0;i<args.Length;i++){if(i+1>=args.Length)throw new ArgumentException("Missing option value");string value=args[++i];
                    if(args[i-1]=="--root")root=Path.GetFullPath(value);else if(args[i-1]=="--settings")path=value;else throw new ArgumentException("Unknown settings option");}
                Application.EnableVisualStyles();Application.SetCompatibleTextRenderingDefault(false);
                using(var window=new AcousticSettingsWindow(root,path??AcousticSettingsStore.DefaultPath(root)))Application.Run(window);return 0;
            }
            catch(Exception e){Console.Error.WriteLine(e.GetType().Name+": "+e.Message);
                MessageBox.Show("Settings could not be opened. Existing files were preserved.\r\n"+e.Message,"RichAudio acoustic settings",MessageBoxButtons.OK,MessageBoxIcon.Error);return 1;}
        }
    }
}
