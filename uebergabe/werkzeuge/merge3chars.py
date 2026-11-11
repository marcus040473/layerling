import re,sys,difflib
pat=re.compile(r'<<<<<<< ours\n(.*?)\|\|\|\|\|\|\| base\n(.*?)=======\n(.*?)>>>>>>> theirs\n', re.S)
def edits(b,x,tag):
    return [(i1,i2,x[j1:j2],tag) for op,i1,i2,j1,j2 in difflib.SequenceMatcher(None,b,x,autojunk=False).get_opcodes() if op!='equal']
def merge(o,b,t):
    es=sorted(edits(b,o,0)+edits(b,t,1), key=lambda e:(e[0],e[1],e[3]))
    out=[];pos=0;last_end=-1
    for i1,i2,rep,tag in es:
        if i1<pos: raise ValueError('overlap at %d'%i1)
        out.append(b[pos:i1]); out.append(rep); pos=i2
    out.append(b[pos:]); return ''.join(out)
for f in sys.argv[1:]:
    s=open(f).read(); n=[0,0]
    def r(m):
        try: n[0]+=1; return merge(*m.groups())
        except ValueError as e: n[1]+=1; print(f,'left:',e); return m.group(0)
    s=pat.sub(r,s); open(f,'w').write(s); print(f,'hunks',n[0],'left',n[1])
